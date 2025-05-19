document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const downloadButton = document.getElementById('download-button');
    const progressButton = document.getElementById('progress-button');
    const currentVersionButton = document.getElementById('current-version-button');

    // For simplicity, using a fixed session ID. In a real app, this would be managed.
    const sessionId = 'session_' + new Date().getTime(); 

    function addMessageToChat(sender, message, isMarkdown = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        messageDiv.classList.add(sender === 'user' ? 'user-message' : 'assistant-message');
        
        if (isMarkdown) {
            // Basic markdown rendering for newlines and code blocks (simplified)
            const pre = document.createElement('pre');
            pre.textContent = message;
            messageDiv.appendChild(pre);
        } else {
            messageDiv.textContent = message;
        }
        
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight; // Scroll to bottom
    }

    function displayError(errorMessage) {
        let errorDiv = document.getElementById('app-error-message');
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.id = 'app-error-message';
            errorDiv.classList.add('error-message');
            chatContainer.parentNode.insertBefore(errorDiv, chatContainer);
        }
        errorDiv.textContent = errorMessage;
        errorDiv.style.display = 'block';
    }

    function clearError() {
        const errorDiv = document.getElementById('app-error-message');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    async function sendMessage(messageText) {
        if (!messageText && chatContainer.children.length === 0) { // Initial message to start conversation
            // No text needed, just trigger the backend to get the first AI message
        } else if (!messageText.trim() && chatContainer.children.length > 0) {
            return; // Don't send empty messages after conversation started
        }

        if (messageText) { // Only add user message if there is text
             addMessageToChat('user', messageText);
        }
       
        messageInput.value = '';
        clearError();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: messageText || '', sessionId: sessionId }), // Send empty message for initial call
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.isDocument) {
                addMessageToChat('assistant', data.response, true); // Display document as markdown
            } else {
                addMessageToChat('assistant', data.response);
            }

            if (data.isComplete) {
                downloadButton.style.display = 'inline-block';
            }

        } catch (error) {
            console.error('Error sending message:', error);
            addMessageToChat('assistant', 'Przepraszam, wystąpił błąd: ' + error.message);
            displayError('Nie udało się połączyć z serwerem lub wystąpił błąd przetwarzania: ' + error.message);
        }
    }

    sendButton.addEventListener('click', () => sendMessage(messageInput.value));
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage(messageInput.value);
        }
    });

    downloadButton.addEventListener('click', async () => {
        try {
            const response = await fetch(`/api/document/download?sessionId=${sessionId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'product_document.md';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Error downloading document:', error);
            addMessageToChat('assistant', 'Nie udało się pobrać dokumentu: ' + error.message);
        }
    });

    progressButton.addEventListener('click', () => sendMessage('progress'));
    currentVersionButton.addEventListener('click', () => sendMessage('aktualna wersja'));

    // Initial message to get the first question from the assistant
    sendMessage(''); 

});
