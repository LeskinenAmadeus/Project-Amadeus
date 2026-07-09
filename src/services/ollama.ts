const OLLAMA_URL = "http://localhost:11434/api/chat";

export async function sendMessage(message: string) {
    const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "amadeus-kurisu",
            messages: [
                {
                    role: "user",
                    content: message,
                },
            ],
            stream: false,
        }),
    });

    if (!response.ok) {
        throw new Error("Failed to communicate with Ollama");
    }

    return await response.json();
}