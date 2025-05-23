// At the top of the file
import { marked } from 'marked';

async function loadFileContent(filePath: string): Promise<string> {
    const response = await fetch(filePath);
    if (!response.ok) {
        throw new Error(`Failed to load file: ${filePath}, status: ${response.status}`);
    }
    const textContent = await response.text();
    return textContent;
}

class ChatBot {
    private questions: string[] = [];
    private currentQuestionIndex: number = 0;
    private answers: { question: string, answer: string }[] = [];
    private documentContent: string = '';

    private chatOutput: HTMLElement;
    private userInput: HTMLInputElement;
    private sendButton: HTMLButtonElement;
    private finalDocumentContainer: HTMLElement;
    private documentOutput: HTMLElement;

    constructor() {
        this.chatOutput = document.getElementById('chat-output')!;
        this.userInput = document.getElementById('user-input') as HTMLInputElement;
        this.sendButton = document.getElementById('send-button') as HTMLButtonElement;
        this.finalDocumentContainer = document.getElementById('final-document-container')!;
        this.documentOutput = document.getElementById('document-output')!;

        this.sendButton.addEventListener('click', () => this.handleUserInput());
        this.userInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                this.handleUserInput();
            }
        });
    }

    async initialize(): Promise<void> {
        try {
            const questionsText = await loadFileContent('questions.md'); 
            this.questions = questionsText.split('---').map(q => q.trim()).filter(q => q.length > 0);

            if (this.questions.length > 0) {
                this.askNextQuestion();
            } else {
                this.addMessageToChat('No questions found. Please check questions.md.', 'bot-message');
            }
        } catch (error: any) {
            this.addMessageToChat(`Error initializing: ${error.message}.`, 'bot-message');
        }
    }

    private addMessageToChat(text: string, senderClass: 'bot-message' | 'user-message'): void {
        if (!this.chatOutput) {
            return;
        }
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', senderClass);

        if (senderClass === 'bot-message') {
            messageElement.innerHTML = marked.parse(text) as string;
        } else {
            messageElement.textContent = text;
        }
        
        this.chatOutput.appendChild(messageElement);
        this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
    }

    private askNextQuestion(): void {
        if (this.currentQuestionIndex < this.questions.length) {
            const question = this.questions[this.currentQuestionIndex];
            this.addMessageToChat(question, 'bot-message');
            if (this.userInput) {
                this.userInput.focus();
            }
        } else {
            this.finalizeDocument();
        }
    }

    private handleUserInput(): void {
        if (!this.userInput) {
            return;
        }
        const answer = this.userInput.value.trim();
        if (answer === '') {
            return;
        }
        
        this.addMessageToChat(answer, 'user-message'); 
        
        const currentQuestion = this.questions[this.currentQuestionIndex];
        this.answers.push({ question: currentQuestion, answer });

        this.currentQuestionIndex++;
        this.userInput.value = ''; 
        this.askNextQuestion();
    }

    private finalizeDocument(): void {
        this.documentContent = this.answers.map(qa => `${qa.question}\n${qa.answer}`).join('\n\n---\n\n');
        
        this.addMessageToChat('All questions answered. Generating document...', 'bot-message');
        
        if (this.documentOutput) {
            this.documentOutput.innerHTML = marked.parse(this.documentContent) as string;
        }

        if (this.finalDocumentContainer) {
            this.finalDocumentContainer.style.display = 'block';
        }

        const inputArea = document.getElementById('input-area');
        if (inputArea) {
            inputArea.style.display = 'none';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    marked.setOptions({
        breaks: true,
        gfm: true 
    });
    const chatBot = new ChatBot();
    chatBot.initialize();
});
