const mongoose = require("mongoose");

const storySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        mediaUrl: {
            type: String,
            required: true,
        },
        type: {
            type: String,
            enum: ["image", "video"],
            required: true,
        },
        caption: {
            type: String,
            default: "",
        },
        viewers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        createdAt: {
            type: Date,
            default: Date.now,
        },
        expiresAt: {
            type: Date,
            required: true,
            // TTL index: expires immediately when current time reaches this date
            expires: 0
        },
    }
);

module.exports = mongoose.model("Story", storySchema);
