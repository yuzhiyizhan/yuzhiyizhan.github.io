(function () {
    let chatButton = document.getElementById("chat-button");
    chatButton.addEventListener("click", () => {
        let botMessage = "";
        let chatInput = document.getElementById("chat-input");
        let chatLog = document.getElementById("chat-log");
        let key = document.getElementById("key").value
        let userMessage = chatInput.value;
        if (!key) {
            botMessage = "不填key有啥好聊的"
            chatLog.innerHTML +=
                `<div class="user-message">${userMessage}</div>` +
                `<div class="bot-message">${botMessage}</div>`;
            chatInput.value = "";
            return
        }
        let model = document.getElementById("model").value
        let max_tokens = document.getElementById("max_tokens").value
        let temperature = document.getElementById("temperature").value
        let top_p = document.getElementById("top_p").value
        let presence_penalty = document.getElementById("presence_penalty").value
        let frequency_penalty = document.getElementById("frequency_penalty").value
        let port = document.getElementById("port").value
        let apiCompletion = async (text) => {
            let res = await axios.post(`http://127.0.0.1:${port}/completions`, {
                key: key,
                model: model,
                prompt: text,
                max_tokens: Number(max_tokens),
                temperature: Number(temperature),
                frequency_penalty: Number(frequency_penalty),
                presence_penalty: Number(presence_penalty),
                top_p: Number(top_p)
            });
            return res;
        };
        chatButton.textContent = "等待返回";
        apiCompletion(userMessage).then(function (response) {
            try{
                botMessage = response.data.choices[0].text
            }catch (e) {
                botMessage = response.data.error.message
            }
            chatLog.innerHTML +=
                `<div class="user-message">${userMessage}</div>` +
                `<div class="bot-message">${botMessage}</div>`;
            chatInput.value = "";
            chatButton.textContent = "发送";

        }).catch(function (error) {
            botMessage = error
            chatLog.innerHTML +=
                `<div class="user-message">${userMessage}</div>` +
                `<div class="bot-message">${botMessage}</div>`;
            chatInput.value = "";
            chatButton.textContent = "发送";

        })
    });
    document.getElementById("clear-button").addEventListener("click", function () {
        document.getElementById("chat-log").innerHTML = "";
    });
}())
