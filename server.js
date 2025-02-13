const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });


app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));


const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    message: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model("Message", messageSchema);


const onlineUsers = new Map();

app.get("/", (req, res) => {
    res.render("index");
});

io.on("connection", (socket) => {
    console.log("🟢 New user connected:", socket.id);


    socket.on("new-user", (username) => {
        onlineUsers.set(username, socket.id);
        io.emit("update-user-list", Array.from(onlineUsers.keys()));
        console.log("👤 User joined:", username);
    });

  
    socket.on("get-messages", async ({ sender, receiver }) => {
        const messages = await Message.find({
            $or: [
                { sender, receiver },
                { sender: receiver, receiver: sender }
            ]
        }).sort({ timestamp: 1 });

        socket.emit("chat-history", messages);
    });

 
    socket.on("send-message", async ({ sender, receiver, message }) => {
        if (!receiver || !message.trim()) return;

        console.log(`📩 Message from ${sender} to ${receiver}: ${message}`);


        const newMessage = new Message({ sender, receiver, message });
        await newMessage.save();


        const receiverSocketId = onlineUsers.get(receiver);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("receive-message", { sender, message });
            console.log(`📨 Delivered to ${receiver}`);
        } else {
            console.log(`❌ ${receiver} is offline.`);
        }
    });

    socket.on("disconnect", () => {
        const username = [...onlineUsers.entries()].find(([key, value]) => value === socket.id)?.[0];
        if (username) {
            onlineUsers.delete(username);
            io.emit("update-user-list", Array.from(onlineUsers.keys()));
            console.log("🔴 User disconnected:", username);
        }
    });
});


server.listen(9000, () => console.log(`🚀 Server running on http://localhost:9000`));


