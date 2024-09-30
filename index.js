const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const crypto = require('crypto');
require('dotenv').config();
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3001;

app.use(cors()); // This will allow all origins

app.use(bodyParser.json());

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

console.log("OPEN AI API CONNECTED SUCCESSFULLY 🚀");

const uri = process.env.MONGODB_URI;
const clientdb = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

clientdb.connect(err => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log("DB CONNECTED SUCCESSFULLY 🚀");
});

const db = clientdb.db('database');
const usersCollection = db.collection('users');

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await usersCollection.findOne({ email, password });
        if (user) {
            res.status(200).json({ message: 'Login successful', userId: user._id.toString() });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (error) {
        res.status(500).json({ error: 'An error occurred during login' });
    }
});

app.post('/register', async (req, res) => {
    const { name, email, password, language, school, grade, performance, location, ambition, hobbies } = req.body;

    if (!name || !email || !password || !language) {
        return res.status(400).json({ error: 'Invalid data. Required fields are missing.' });
    }

    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');

    const newUser = {
        name,
        email,
        password: hashedPassword,
        language,
        school: school || '',
        grade: grade || '',
        performance: performance || '',
        location: location || '',
        ambition: ambition || '',
        hobbies: hobbies || '',
        interests: []
    };

    try {
        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({ message: 'User registered successfully', userId: result.insertedId.toString() });
    } catch (error) {
        console.error(`Error registering user: ${error}`);
        res.status(500).json({ error: 'Failed to register user.' });
    }
});

app.post('/update_user', async (req, res) => {
    const { email, education, location, grade, ambition, hobbies, learning_capacities, interests } = req.body;

    const updatedInfo = {
        education,
        location,
        grade,
        ambition,
        hobbies,
        learning_capacities,
        interests
    };

    try {
        const result = await usersCollection.updateOne({ email }, { $set: updatedInfo });
        if (result.modifiedCount > 0) {
            res.status(200).json({ message: 'User information updated successfully' });
        } else {
            res.status(404).json({ error: 'User not found or no changes applied' });
        }
    } catch (error) {
        res.status(500).json({ error: 'An error occurred during the update' });
    }
});

app.post('/chat', async (req, res) => {
    const { message, language } = req.body;
    const new_prompt = `${message} Give me 1 single sentence only - simple one`;

    try {
        const response = await client.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: `Answer the following in ${language} language:` },
                { role: "user", content: message }
            ],
            max_tokens: 150
        });

        const aiResponse = response.choices[0].message.content.trim();
        res.status(200).json({ response: new_prompt });
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while generating the chat response' });
    }
});

app.post('/roadmap-generator', async (req, res) => {
    const { email, input_text } = req.body;
  
    if (!email || !input_text) {
      return res.status(400).json({ error: 'Email and input text are required' });
    }
  
    try {
      // Retrieve user details from MongoDB
      const user = await usersCollection.findOne({ email });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
      console.log('User details:', JSON.stringify(user, null, 2));
  
      // Construct prompt for OpenAI
      const prompt = `
        Based on the following user details:
        - School: ${user.school || 'N/A'}
        - Grade: ${user.grade || 'N/A'}
        - Performance: ${user.performance || 'N/A'}
        - Location: ${user.location || 'N/A'}
        - Ambition: ${user.ambition || 'N/A'}
        - Hobbies: ${Array.isArray(user.hobbies) ? user.hobbies.join(', ') : (user.hobbies || 'N/A')}
  
        Please suggest 3 career roles related to: ${input_text}. 
        For each role, provide:
        1. Title
        2. Brief description (1-2 sentences)
        3. Estimated time to achieve proficiency (considering the user's background)
        4. Link to study materials like online courses, books, etc. add some like top 1 link randomly good one which is free
  
        Format each suggestion as:
        Title: [Career Title]
        Description: [Brief description]
        Time to Proficiency: [Estimated time]
        Link to Study Materials: [URL]
      `;
  
      // Request career role suggestions from OpenAI
      const completion = await client.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are an AI assistant that suggests career roles based on user details." },
          { role: "user", content: prompt }
        ],
        max_tokens: 1000
      });
  
      // Process AI response to extract career role suggestions
      const aiResponse = completion.choices[0].message.content.trim();
      const careerSuggestions = aiResponse.split('\n\n');

  
      // Parse career roles
      const careerRoles = careerSuggestions.map(suggestion => {
        const lines = suggestion.split('\n');
        if (lines.length >= 3) {
          return {
            title: lines[0].replace('Title: ', '').trim(),
            description: lines[1].replace('Description: ', '').trim(),
            time_to_complete: lines[2].replace('Time to Proficiency: ', '').trim(),
            URL: lines[3].replace('Link to Study Materials: ', '').trim()
          };
        }
        return null;
      }).filter(role => role !== null);
  
      // Respond with generated career roles
      res.status(200).json({ career_roles: careerRoles });
    } catch (error) {
      console.error('Error generating roadmap:', error);
      res.status(500).json({ error: 'An error occurred while generating the roadmap', details: error.message });
    }
});

app.post('/analyze-image', async (req, res) => {
    const { imageData } = req.body;
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }
  
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "can you identify the math problem in the image.No explanation.ignore the grids from the image" },
              {
                type: "image_url",
                image_url: {
                  url: imageData,
                },
              },
            ],
          },
        ],
        max_tokens: 300,
      });
  
      const analysis = response.choices[0].message.content;
      res.status(200).json({ analysis });
    } catch (error) {
      console.error('Error analyzing image:', error);
      res.status(500).json({ error: 'An error occurred while analyzing the image' });
    }
  });


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
