import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const OLLAMA_API_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434'; // Configurable

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let systemMessageContent: string = '';
const SYSTEM_MESSAGE_PATH = path.join(__dirname, '../system_message.md');

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaRequest {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
}

interface OllamaResponse {
  message: {
    role: 'assistant';
    content: string;
  };
  done: boolean;
}

interface ConversationState {
  sessionId: string;
  messages: ChatMessage[];
  currentDocumentState: { [key: string]: string };
  currentSectionIndex: number;
  sections: string[];
  documentTemplate: string;
}

const conversationStore: { [sessionId: string]: ConversationState } = {};

async function loadSystemMessage(): Promise<string> {
  if (!systemMessageContent) {
    try {
      console.log(`Loading system message from: ${SYSTEM_MESSAGE_PATH}`);
      systemMessageContent = await fs.readFile(SYSTEM_MESSAGE_PATH, 'utf-8');
      console.log('System message loaded successfully.');
    } catch (error) {
      console.error('Failed to load system message:', error);
      systemMessageContent = '### Wprowadzenie/Przegląd:\\n* Co to za produkt/projekt?\\n* Jaki problem rozwiązuje?\\n* Jaka jest jego główna wartość?\\n\\n[user input here]\\n'; // Basic fallback
    }
  }
  return systemMessageContent;
}

function parseSectionsFromTemplate(template: string): string[] {
  const sectionRegex = /### (.*?):/g;
  const sections: string[] = [];
  let match;
  while ((match = sectionRegex.exec(template)) !== null) {
    sections.push(match[1].trim());
  }
  console.log('Parsed sections:', sections);
  return sections;
}

async function getConversation(sessionId: string): Promise<ConversationState> {
  if (!conversationStore[sessionId]) {
    const template = await loadSystemMessage();
    const sections = parseSectionsFromTemplate(template);
    
    conversationStore[sessionId] = {
      sessionId,
      messages: [{ role: 'system', content: template }],
      currentDocumentState: {},
      currentSectionIndex: 0,
      sections,
      documentTemplate: template,
    };
  }
  return conversationStore[sessionId];
}

async function callOllama(messages: ChatMessage[]): Promise<string> {
  console.log(`Sending request to Ollama at ${OLLAMA_API_URL}/api/chat`);
  try {
    const ollamaRequest: OllamaRequest = {
      model: 'qwen2:1.5b', // User mentioned qwen3:4b. Using a smaller, common model.
      messages: messages,
      stream: false,
    };

    // Note: node-fetch v2 (CJS) is used as per package.json
    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Ollama API error: ${response.status} ${response.statusText}`, errorBody);
      throw new Error(`Ollama API request failed with status ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as OllamaResponse;
    console.log('Received response from Ollama:', data);
    return data.message.content;
  } catch (error) {
    console.error('Error calling Ollama:', error);
    throw error;
  }
}

function generateMarkdownDocument(conversation: ConversationState): string {
  let markdown = conversation.documentTemplate;
  
  conversation.sections.forEach(sectionName => {
    const sectionContent = conversation.currentDocumentState[sectionName] || '';
    const placeholder = '[user input here]';
    // Escape sectionName for regex and build the regex
    const escapedSectionName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Regex to find "### Section Name:" followed by any characters (including newlines)
    // non-greedily, until it finds "[user input here]".
    const sectionRegex = new RegExp(
        `(### ${escapedSectionName}:(?:\\r\\n|\\r|\\n|.)*?)${escapedPlaceholder}`
    , 'm');
    
    if (markdown.match(sectionRegex)) {
        markdown = markdown.replace(sectionRegex, `$1${sectionContent.trim() === '' ? '' : sectionContent}`);
    }
  });
  
  // Clean up any remaining [user input here] placeholders.
  markdown = markdown.replace(/\[user input here\]/g, '');
  return markdown;
}

app.post('/api/chat', async (req: Request, res: Response, next: NextFunction) => {
  const { message, sessionId = 'default' } = req.body;

  if (!message && (!conversationStore[sessionId] || conversationStore[sessionId].messages.length <= 1)) {
      // Initial call or conversation just started
  } else if (!message) {
    return res.status(400).json({ error: 'Message is required for subsequent turns' });
  }

  try {
    const conversation = await getConversation(sessionId);

    if (message) { 
        conversation.messages.push({ role: 'user', content: message });
    }

    if (message && message.toLowerCase() === 'progress') {
      const totalSections = conversation.sections.length;
      const filledSections = Object.keys(conversation.currentDocumentState).filter(key => conversation.currentDocumentState[key]?.trim() !== '').length;
      const progress = totalSections > 0 ? (filledSections / totalSections) : 0;
      return res.json({ response: `Current progress: ${Math.round(progress * 100)}%`, progress: progress.toFixed(2) });
    }

    if (message && message.toLowerCase() === 'aktualna wersja') {
      const markdownDocument = generateMarkdownDocument(conversation);
      return res.json({ response: markdownDocument, isDocument: true });
    }

    const ollamaResponseContent = await callOllama(conversation.messages);
    conversation.messages.push({ role: 'assistant', content: ollamaResponseContent });

    if (message && conversation.currentSectionIndex < conversation.sections.length) {
        const currentSectionName = conversation.sections[conversation.currentSectionIndex];
        const aiSeemsToConfirm = /dziękuję|rozumiem|świetnie|dobrze|zapisuję|zanotowałem|przejdźmy|kolejne pytanie|następna sekcja/i.test(ollamaResponseContent);
        // Make substring robust against short section names
        const sectionNameStart = currentSectionName.substring(0, Math.min(5, currentSectionName.length));
        const aiAsksForSameSection = new RegExp(sectionNameStart, 'i').test(ollamaResponseContent);

        if (!aiAsksForSameSection || aiSeemsToConfirm) { 
            const existingContent = conversation.currentDocumentState[currentSectionName] || '';
            if (!existingContent.includes(message)) { // Avoid duplicating the exact same message
                 conversation.currentDocumentState[currentSectionName] = (existingContent + message + '\\n').trim() + '\\n';
            }
            
            const isLastSection = conversation.currentSectionIndex >= conversation.sections.length - 1;
            if (!isLastSection && aiSeemsToConfirm && !aiAsksForSameSection) {
                 conversation.currentSectionIndex++;
                 console.log(`Advanced to section: ${conversation.sections[conversation.currentSectionIndex]}`);
            } else if (isLastSection && aiSeemsToConfirm) {
                console.log('All sections appear to be filled.');
            }
        }
    }
    
    const allSectionsFilled = conversation.sections.every(section => conversation.currentDocumentState[section]?.trim() !== '');
    const isComplete = conversation.currentSectionIndex >= conversation.sections.length - 1 && allSectionsFilled;

    res.json({ 
        response: ollamaResponseContent,
        currentSection: conversation.sections[conversation.currentSectionIndex] || 'Completed',
        isComplete: isComplete
    });

  } catch (error) {
    console.error('Chat API error:', error);
    if (error instanceof Error) {
        next(error);
    } else {
        next(new Error('An unknown error occurred in Chat API'));
    }
  }
});

app.get('/api/document/download', async (req: Request, res: Response) => {
  const { sessionId = 'default' } = req.query as { sessionId?: string };
  try {
    const conversation = await getConversation(sessionId);
    if (!conversation) { // Check if conversation exists
        return res.status(404).send('Session not found. Please start a conversation first.');
    }
    const markdownDocument = generateMarkdownDocument(conversation);
    
    res.setHeader('Content-Disposition', 'attachment; filename="product_document.md"');
    res.type('text/markdown');
    res.send(markdownDocument);
  } catch (error) {
    console.error('Download API error:', error);
    res.status(500).send('Failed to generate document for download.');
  }
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => { // _next to indicate it's not used
  console.error('Global error handler:', err.stack);
  res.status(500).json({ error: 'Something broke!', message: err.message });
});

async function startServer() {
    await loadSystemMessage(); 
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
        console.log(`Static files served from: ${path.join(__dirname, '../public')}`);
        console.log(`Ollama API configured at: ${OLLAMA_API_URL}`);
        console.log(`Attempting to use Ollama model: qwen2:1.5b (configurable in src/index.ts or .env OLLAMA_MODEL)`);
    });
}

startServer();