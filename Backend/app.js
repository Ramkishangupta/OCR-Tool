const express = require('express');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const sharp = require('sharp'); // For image processing
const translate = require('translate-google'); // Translation library

const app = express();
const upload = multer({ dest: path.join(__dirname, 'uploads/') });

// In-memory data structure to store rows
let rows = [];

// Serve the HTML form
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

// Handle multiple image uploads and process them
app.post('/process-images', upload.array('images', 10), async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).send('No files uploaded.');
    }

    // Process each uploaded image
    for (const file of files) {
      const imagePath = file.path;
      const trimmedImagePath = path.join(__dirname, 'uploads', `trimmed-${Date.now()}-${file.originalname}`);

      // Get image metadata to calculate trimming dimensions
      const metadata = await sharp(imagePath).metadata();
      const { width, height } = metadata;

      // Automatically trim the image using Sharp
      await sharp(imagePath)
        .extract({
          top: 30, // Trim 30px from the top
          left: 0,
          width: width - 100, // Remove 100px from the right
          height: height - 30 - 50, // Remove 30px from top and 50px from bottom
        })
        .toFile(trimmedImagePath);

      // Extract text from the trimmed image using Tesseract.js
      const { data: { text } } = await Tesseract.recognize(trimmedImagePath, 'hin', {
        logger: (info) => console.log(info), // Optional: Log Tesseract.js progress
      });

      console.log('Extracted text:', text);

      // Translate Hindi text to English
      const lines = text.split('\n').filter(line => line.trim());
      for (const line of lines) {
        const hindiText = line.trim();
        if (hindiText) {
          try {
            const translatedText = await translate(hindiText, { from: 'hi', to: 'en' });
            rows.push({ Name: hindiText, Translation: translatedText, Aadhaar: '', Mobile: '' });
            console.log(`Translated: ${hindiText} -> ${translatedText}`);
          } catch (translationError) {
            console.error(`Error translating text: ${hindiText}`, translationError);
          }
        }
      }
    }

    // Send response to the user
    res.send(`
      <h1>Processing Complete</h1>
      <a href="/download">Download Excel File</a>
    `);
  } catch (error) {
    console.error('Error processing the images:', error);
    res.status(500).send('An error occurred while processing the images.');
  }
});

// Endpoint to download the Excel file
app.get('/download', (req, res) => {
  try {
    if (rows.length === 0) {
      return res.status(400).send('No data available to download.');
    }

    // Create the Excel file from accumulated rows
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Data');

    const excelPath = path.join(__dirname, 'output.xlsx');
    xlsx.writeFile(workbook, excelPath);

    res.download(excelPath, 'output.xlsx', (err) => {
      if (err) {
        console.error('Error downloading the file:', err);
        res.status(500).send('Failed to download file.');
      } else {
        // Clear the accumulated rows
        rows = [];
        console.log('Excel file downloaded successfully.');
      }
    });
  } catch (error) {
    console.error('Error generating the Excel file:', error);
    res.status(500).send('An error occurred while generating the Excel file.');
  }
});

// Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});