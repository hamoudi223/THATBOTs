# Utiliser une image officielle Node.js stable
FROM node:20-alpine

# Répertoire de travail dans le container
WORKDIR /app

# Copier uniquement les fichiers de gestion des dépendances pour optimiser le cache Docker
COPY package.json package-lock.json ./

# Installer les dépendances (attention à bien avoir package-lock.json à jour)
RUN npm ci --only=production

# Copier le reste du code source dans le container
COPY . .

# Exposer le port que ton app utilise (ex: 3000)
EXPOSE 3000

# Démarrer ton bot (modifier si nécessaire)
CMD ["node", "server.js"]
