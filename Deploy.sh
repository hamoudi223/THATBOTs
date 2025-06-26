#!/bin/bash

echo "Installation des dépendances npm..."
npm install

echo "Ajout de package-lock.json au git..."
git add package-lock.json

echo "Commit des changements..."
git commit -m "Add package-lock.json for stable dependencies"

echo "Push vers GitHub..."
git push origin main

echo "Terminé !"
