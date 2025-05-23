async function loadFileContent(filePath: string): Promise<string> {
    console.log(`Attempting to load file: ${filePath}`);
    const response = await fetch(filePath);
    if (!response.ok) {
        console.error(`Failed to load file: ${filePath}, status: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to load file: ${filePath}, status: ${response.status}`);
    }
    const textContent = await response.text();
    console.log(`Successfully loaded file: ${filePath}`);
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
        console.log("ChatBot constructor called.");
        this.chatOutput = document.getElementById('chat-output')!;
        this.userInput = document.getElementById('user-input') as HTMLInputElement;
        this.sendButton = document.getElementById('send-button') as HTMLButtonElement;
        this.finalDocumentContainer = document.getElementById('final-document-container')!;
        this.documentOutput = document.getElementById('document-output')!;

        if (!this.chatOutput) console.error("Chat output element not found in constructor!");
        if (!this.userInput) console.error("User input element not found in constructor!");
        if (!this.sendButton) console.error("Send button element not found in constructor!");


        this.sendButton.addEventListener('click', () => this.handleUserInput());
        this.userInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                this.handleUserInput();
            }
        });
        console.log("Event listeners attached.");
    }

    async initialize(): Promise<void> {
        try {
            console.log("ChatBot initializing...");
            const questionsText = await loadFileContent('questions.md'); 
            console.log("questions.md raw content:", questionsText ? questionsText.substring(0, 100) + "..." : "EMPTY");
            this.questions = questionsText.split('---').map(q => q.trim()).filter(q => q.length > 0);
            console.log("Parsed questions:", JSON.stringify(this.questions));

            if (this.questions.length > 0) {
                console.log("Questions loaded, asking first question.");
                this.askNextQuestion();
            } else {
                console.warn("No questions found or questions array is empty after parsing.");
                this.addMessageToChat('No questions found. Please check questions.md.', 'bot-message');
            }
        } catch (error: any) {
            console.error("Error initializing chatbot:", error);
            this.addMessageToChat(`Error initializing: ${error.message}. Check console for details.`, 'bot-message');
        }
    }

    private addMessageToChat(text: string, senderClass: 'bot-message' | 'user-message'): void {
        console.log(`addMessageToChat called. Text: "${text}", Sender: ${senderClass}`);
        if (!this.chatOutput) {
            console.error("chatOutput element is null or undefined in addMessageToChat!");
            return;
        }
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', senderClass);
        messageElement.textContent = text;
        this.chatOutput.appendChild(messageElement);
        console.log("Message element appended to chatOutput:", messageElement);
        this.chatOutput.scrollTop = this.chatOutput.scrollHeight;
    }

    private askNextQuestion(): void {
        console.log(`askNextQuestion called. Index: ${this.currentQuestionIndex}, Total questions: ${this.questions.length}`);
        if (this.currentQuestionIndex < this.questions.length) {
            const question = this.questions[this.currentQuestionIndex];
            console.log("Asking question:", question);
            this.addMessageToChat(question, 'bot-message');
            if (this.userInput) {
                this.userInput.focus();
            } else {
                console.error("userInput element is null in askNextQuestion!");
            }
        } else {
            console.log("All questions answered, finalizing document.");
            this.finalizeDocument();
        }
    }

    private handleUserInput(): void {
        console.log("handleUserInput called.");
        if (!this.userInput) {
            console.error("userInput element is null in handleUserInput!");
            return;
        }
        const answer = this.userInput.value.trim();
        if (answer === '') {
            console.log("User input is empty, not processing.");
            return;
        }

        this.addMessageToChat(answer, 'user-message');
        
        const currentQuestion = this.questions[this.currentQuestionIndex];
        this.answers.push({ question: currentQuestion, answer });
        console.log("Answer recorded:", { question: currentQuestion, answer });

        this.currentQuestionIndex++;
        this.userInput.value = ''; 
        this.askNextQuestion();
    }

    private finalizeDocument(): void {
        console.log("finalizeDocument called.");
        this.documentContent = this.answers.map(qa => `${qa.question}\n${qa.answer}`).join('\n\n');
        
        this.addMessageToChat('All questions answered. Generating document...', 'bot-message');
        
        if (!this.documentOutput) {
            console.error("documentOutput element is null in finalizeDocument!");
        } else {
            this.documentOutput.textContent = this.documentContent;
            console.log("Final document content set.");
        }

        if (!this.finalDocumentContainer) {
            console.error("finalDocumentContainer element is null in finalizeDocument!");
        } else {
            this.finalDocumentContainer.style.display = 'block';
            console.log("Final document container displayed.");
        }

        const inputArea = document.getElementById('input-area');
        if (inputArea) {
            inputArea.style.display = 'none';
            console.log("Input area hidden.");
        } else {
            console.warn("Input area element not found in finalizeDocument.");
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event fired.");
    const chatBot = new ChatBot();
    chatBot.initialize();
});
