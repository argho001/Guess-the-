#!/bin/bash
# Ensure we are in the correct directory (handling the trailing space)
cd "/Users/argho/Documents/Guess the নেতা "

echo "Initializing Git..."
git init

echo "Creating README..."
echo "# Guess-the-Neta" >> README.md

echo "Adding ALL files (Game Code + Assets)..."
git add .

echo "Committing..."
git commit -m "First commit for Render deployment"

echo "Renaming branch to main..."
git branch -M main

echo "Adding remote origin..."
# Remove origin if it exists to avoid errors on retry
git remote remove origin 2>/dev/null
git remote add origin https://github.com/argho001/Guess-the-.git

echo "Pushing to GitHub..."
echo "If this fails, check your GitHub credentials!"
git push -u origin main
