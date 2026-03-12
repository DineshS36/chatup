const express = require("express");
const router = express.Router();
const Story = require("../models/Story");
const protect = require("../middleware/auth");
const upload = require("../middleware/upload");

// POST /api/stories
// Create a new story
router.post("/", protect, upload.single("media"), async (req, res) => {
    try {
        const { caption, type } = req.body;

        if (!req.file && !req.body.mediaUrl) {
            return res.status(400).json({ error: "Media is required" });
        }

        const mediaUrl = req.file ? req.file.path : req.body.mediaUrl;

        // Expire exactly 24 hours from creation
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const story = await Story.create({
            userId: req.userId,
            mediaUrl,
            type: type || (req.file.mimetype.startsWith("video") ? "video" : "image"),
            caption,
            expiresAt
        });

        await story.populate("userId", "name avatar");

        res.status(201).json({ success: true, data: story });
    } catch (error) {
        console.error("Error creating story:", error);
        res.status(500).json({ error: "Server error creating story" });
    }
});

// GET /api/stories
// Fetch active stories (we group them by user on the frontend or here)
router.get("/", protect, async (req, res) => {
    try {
        // Fetch stories that have not expired yet
        const stories = await Story.find({ expiresAt: { $gt: new Date() } })
            .populate("userId", "name avatar")
            .sort({ createdAt: -1 });

        // Group stories by userId
        const groupedStories = {};
        stories.forEach(story => {
            const uId = story.userId._id.toString();
            if (!groupedStories[uId]) {
                groupedStories[uId] = {
                    user: story.userId,
                    stories: []
                };
            }
            groupedStories[uId].stories.push(story);
        });

        // Convert grouped object to array
        const groupedArray = Object.values(groupedStories);

        res.status(200).json({ success: true, data: groupedArray });
    } catch (error) {
        console.error("Error fetching stories:", error);
        res.status(500).json({ error: "Server error fetching stories" });
    }
});

// PUT /api/stories/:id/view
// Mark story as viewed
router.put("/:id/view", protect, async (req, res) => {
    try {
        const story = await Story.findById(req.params.id);

        if (!story) {
            return res.status(404).json({ error: "Story not found" });
        }

        // Add user to viewers if not already present
        if (!story.viewers.includes(req.userId)) {
            story.viewers.push(req.userId);
            await story.save();
        }

        res.status(200).json({ success: true, data: story });
    } catch (error) {
        console.error("Error viewing story:", error);
        res.status(500).json({ error: "Server error viewing story" });
    }
});

module.exports = router;
