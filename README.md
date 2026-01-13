# Quiz App - Application Web Multi-conteneurs avec Docker



##  Table des matières

- [Description](#-description)
- [Architecture](#-architecture)
- [Prérequis](#-prérequis)
- [Installation](#-installation)
- [Configuration](#-configuration)
- [Lancement](#-lancement)
- [Tests et validation](#-tests-et-validation)
- [Structure du projet](#-structure-du-projet)
- [Documentation technique](#-documentation-technique)
- [Commandes utiles](#-commandes-utiles)
- [Dépannage](#-dépannage)
- [Docker Hub (Bonus)](#-docker-hub-bonus)
- [Auteur](#-auteur)

---

##  Description

Ce projet est une **application web de quiz** développée avec une architecture microservices conteneurisée. L'application est composée de trois services principaux orchestrés avec Docker Compose :

- **Frontend** : Interface utilisateur servie par Nginx (build multi-stage avec Vite)
- **Backend** : API REST développée avec Node.js et Express
- **Database** : Base de données PostgreSQL 17 pour le stockage persistant des données

L'objectif de ce projet est de démontrer la maîtrise de Docker, des Dockerfiles, de Docker Compose, ainsi que les bonnes pratiques de conteneurisation et d'orchestration.

---

##  Architecture

### Vue d'ensemble

L'application suit une **architecture multi-tiers** où chaque service est isolé dans son propre conteneur :

```
┌─────────────────────────────────────────────────────────────────┐
│                      Docker Network (bridge)                    │
│                                                                 │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │  Frontend   │      │   Backend   │      │  Database   │     │
│  │   (Nginx)   │─────▶│  (Express)  │─────▶│ (PostgreSQL)│     │
│  │   Port 80   │      │  Port 3007  │      │  Port 5432  │     │
│  │   (interne) │      │  (interne)  │      │  (interne)  │     │
│  └─────────────┘      └─────────────┘      └─────────────┘     │
│         │                                         │             │
│         │                                         │             │
│    Port 8087                              Volume: postgres_data │
│    (exposé)                                (persistance)        │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
    Navigateur Web (http://localhost:8087)
```

### Services détaillés

| Service | Technologie | Port | Rôle | Description |
|---------|------------|------|------|-------------|
| **frontend** | Nginx (Alpine) | 80 (interne) → 8087 (hôte) | Serveur web + Reverse proxy | Sert les fichiers statiques compilés par Vite et fait proxy vers l'API backend |
| **backend** | Node.js 24 + Express | 3007 (interne uniquement) | API REST | Gère l'authentification admin, les résultats de quiz, et la communication avec la base de données |
| **db** | PostgreSQL 17 (Alpine) | 5432 (interne uniquement) | Base de données | Stocke les utilisateurs, résultats de quiz, et réponses individuelles |

### Flux de données

1. **Requête HTTP** → Frontend (Nginx) sur le port 8087
2. **Fichiers statiques** → Servis directement par Nginx
3. **Requêtes API** (`/api/*`) → Proxy vers Backend (port 3007)
4. **Backend** → Traite la requête et communique avec PostgreSQL
5. **Réponse** → Retourne les données au client via Nginx

---

##  Prérequis

Avant de commencer, assurez-vous d'avoir installé les outils suivants :

### Docker

- **Docker Desktop** (recommandé) ou **Docker Engine** + **Docker Compose**
- Version minimale requise : **Docker 20.10+**
- Version minimale de Docker Compose : **2.0+**

### Vérification des versions

```bash
# Vérifier la version de Docker
docker --version
# Sortie attendue : Docker version 20.10.x ou supérieur

# Vérifier la version de Docker Compose
docker compose version
# Sortie attendue : Docker Compose version v2.x.x ou supérieur
```

### Système d'exploitation

-  macOS 10.15+ (avec Docker Desktop)
-  Linux (Ubuntu 20.04+, Debian 10+, etc.)
- Windows 10/11 (avec Docker Desktop ou WSL2)

---

##  Installation

### 1. Cloner le dépôt

```bash
git clone https://gitlab.com/ftutorials-evaluations/quiz-app.git
cd quiz-app
```

### 2. Vérifier la structure du projet

Assurez-vous que tous les fichiers nécessaires sont présents :

```bash
ls -la
# Vous devriez voir :
# - docker-compose.yml
# - Dockerfile (frontend)
# - .env.example
# - backend/
# - database/
# - nginx/
```

---

##  Configuration

### Variables d'environnement

Le projet utilise un fichier `.env` pour la configuration. Un fichier `.env.example` est fourni comme template.

#### Créer le fichier .env

```bash
# Si le fichier .env n'existe pas, copiez l'exemple
cp .env.example .env
```

#### Variables disponibles

Éditez le fichier `.env` avec vos valeurs (ou gardez les valeurs par défaut pour les tests) :

```bash
# Configuration PostgreSQL
POSTGRES_USER=quiz_user
POSTGRES_PASSWORD=quiz_password
POSTGRES_DB=quiz_db

# Configuration API (optionnel pour les tests locaux)
RESEND_API_KEY=re_xxxxxxxxxxxx

# Identifiants administrateur
ADMIN_USERNAME=admin
ADMIN_PASSWORD=changeme

# Clé secrète pour JWT (changez en production !)
JWT_SECRET=change-this-to-a-secure-random-string
```

####  Sécurité en production

Pour un environnement de production, **modifiez absolument** :
- `ADMIN_PASSWORD` : Utilisez un mot de passe fort
- `JWT_SECRET` : Générez une clé aléatoire sécurisée (ex: `openssl rand -hex 32`)
- `POSTGRES_PASSWORD` : Utilisez un mot de passe fort
- `RESEND_API_KEY` : Utilisez une vraie clé API si vous utilisez l'envoi d'emails

---

##  Lancement

### Premier lancement (build complet)

Pour la première fois, construisez les images et démarrez tous les services :

```bash
docker compose up --build
```

Cette commande va :
1.  Construire les 3 images Docker (database, backend, frontend)
2.  Créer le réseau Docker pour la communication inter-conteneurs
3.  Créer le volume nommé `postgres_data` pour la persistance
4.  Démarrer les services dans l'ordre (db → backend → frontend)
5.  Afficher les logs en temps réel

### Lancement en arrière-plan (mode détaché)

Pour lancer l'application sans bloquer le terminal :

```bash
docker compose up -d --build
```

Le flag `-d` (detached) démarre les conteneurs en arrière-plan.

### Commandes de lancement rapides

```bash
# Démarrer sans rebuild (si les images existent déjà)
docker compose up

# Démarrer en arrière-plan sans rebuild
docker compose up -d

# Rebuild uniquement un service spécifique
docker compose up --build frontend

# Rebuild sans utiliser le cache
docker compose build --no-cache
docker compose up
```

---

##  Tests et validation

### 1. Vérification de l'état des services

Vérifiez que tous les services sont en cours d'exécution :

```bash
docker compose ps
```

**Sortie attendue :**

```
NAME                 COMMAND                  SERVICE             STATUS              PORTS
quiz-app-backend-1   "npm start"              backend             running             3007/tcp
quiz-app-db-1        "docker-entrypoint.s…"   db                  running (healthy)   5432/tcp
quiz-app-frontend-1  "/docker-entrypoint.…"   frontend            running             0.0.0.0:8087->80/tcp
```

 **Critère de succès** : 
- Les 3 services doivent être en état `running`
- Le service `db` doit afficher `(healthy)` dans la colonne STATUS

### 2. Consultation des logs

#### Logs de tous les services

```bash
docker compose logs -f
```

#### Logs d'un service spécifique

```bash
# Logs du backend
docker compose logs -f backend

# Logs du frontend
docker compose logs -f frontend

# Logs de la base de données
docker compose logs -f db
```

### 3. Tests fonctionnels avec curl

#### Test de la page d'accueil

```bash
curl http://localhost:8087
```

**Résultat attendu** : Code HTTP 200 avec le HTML de la page d'accueil

#### Test du health check

```bash
curl http://localhost:8087/health
```

**Résultat attendu** : 
```json
{"status":"ok"}
```

#### Test de la page d'administration

```bash
curl http://localhost:8087/gestion-quiz
```

**Résultat attendu** : Code HTTP 200 avec le HTML de la page d'administration

#### Test avec affichage des en-têtes HTTP

```bash
curl -v http://localhost:8087/health
```

### 4. Tests dans le navigateur

Ouvrez votre navigateur et accédez à :

- **Page d'accueil** : http://localhost:8087
- **Page d'administration** : http://localhost:8087/gestion-quiz
  - Identifiants par défaut :
    - Username : `admin`
    - Password : `changeme`

### 5. Vérification des volumes

#### Lister les volumes

```bash
docker volume ls
```

Vous devriez voir le volume `quiz-app_postgres_data`.

#### Inspecter le volume PostgreSQL

```bash
docker volume inspect quiz-app_postgres_data
```

**Résultat attendu** :

```json
[
    {
        "CreatedAt": "2026-01-13T14:55:35Z",
        "Driver": "local",
        "Labels": {
            "com.docker.compose.project": "quiz-app",
            "com.docker.compose.volume": "postgres_data"
        },
        "Mountpoint": "/var/lib/docker/volumes/quiz-app_postgres_data/_data",
        "Name": "quiz-app_postgres_data",
        "Options": null,
        "Scope": "local"
    }
]
```

### 6. Test de persistance des données

Pour vérifier que les données persistent après un redémarrage :

```bash
# 1. Arrêter les conteneurs (sans supprimer les volumes)
docker compose down

# 2. Redémarrer l'application
docker compose up -d

# 3. Vérifier que les données sont toujours présentes
# (Connectez-vous à l'application et vérifiez vos données)
```

 **Critère de succès** : Les données doivent être conservées après le redémarrage.

---

##  Structure du projet

```
quiz-app/
├──  Dockerfile                 # Dockerfile multi-stage pour le frontend
├──  docker-compose.yml         # Configuration Docker Compose
├──  .env                       # Variables d'environnement (à créer)
├──  .env.example               # Template des variables d'environnement
├──  package.json               # Dépendances frontend (Vite)
├──  vite.config.js             # Configuration Vite
├──  index.html                 # Page HTML principale
├──  main.js                    # Point d'entrée JavaScript
├──  gestion-quiz.html          # Page d'administration
│
├──  nginx/
│   └──  nginx.conf             # Configuration Nginx (reverse proxy)
│
├──  backend/
│   ├──  Dockerfile             # Dockerfile pour le backend
│   ├──  server.js              # API Express (routes, middleware)
│   └──  package.json           # Dépendances backend
│
├──  database/
│   ├──  Dockerfile             # Dockerfile pour PostgreSQL
│   └──  init.sql               # Script d'initialisation SQL (schéma)
│
└──  public/
    ├──  admin.css              # Styles de la page d'administration
    ├──  admin.js               # JavaScript de la page d'administration
    └──  gestion-quiz.html      # Copie de la page d'administration
```

---

##  Documentation technique

### Dockerfiles

#### Database (`database/Dockerfile`)

```dockerfile
FROM postgres:17-alpine

COPY init.sql /docker-entrypoint-initdb.d/
```

**Caractéristiques** :
- Image de base : `postgres:17-alpine` (légère et sécurisée)
- Initialisation automatique : Le script `init.sql` est copié dans `/docker-entrypoint-initdb.d/`
- PostgreSQL exécute automatiquement tous les scripts `.sql` de ce répertoire au premier démarrage

#### Backend (`backend/Dockerfile`)

```dockerfile
FROM node:24-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the port
EXPOSE 3007

# Start the application
CMD ["npm", "start"]
```

**Caractéristiques** :
- Image de base : `node:24-alpine`
- **Optimisation du cache Docker** : Les fichiers `package*.json` sont copiés en premier
  - Cela permet de réutiliser le cache de la couche `npm install` si seul le code source change
- Port exposé : 3007 (interne uniquement)

#### Frontend (`Dockerfile` - Multi-stage build)

```dockerfile
# Stage 1: Build
FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Caractéristiques** :
- **Build multi-stage** : Réduit la taille finale de l'image
  - **Stage 1 (build)** : Compile l'application avec Vite
  - **Stage 2 (production)** : Utilise uniquement Nginx Alpine (image finale légère)
- Les fichiers compilés sont copiés depuis le stage build
- Configuration Nginx pour le reverse proxy

### Docker Compose (`docker-compose.yml`)

#### Service Database

```yaml
db:
  build:
    context: ./database
  environment:
    POSTGRES_USER: ${POSTGRES_USER}
    POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    POSTGRES_DB: ${POSTGRES_DB}
  volumes:
    - postgres_data:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
    interval: 5s
    timeout: 5s
    retries: 5
  restart: unless-stopped
```

**Points clés** :
- **Health check** : Vérifie que PostgreSQL est prêt à accepter des connexions
- **Volume nommé** : `postgres_data` pour la persistance des données
- **Restart policy** : `unless-stopped` (redémarre automatiquement sauf si arrêté manuellement)

#### Service Backend

```yaml
backend:
  build:
    context: ./backend
  expose:
    - "3007"
  environment:
    DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
    RESEND_API_KEY: ${RESEND_API_KEY}
    ADMIN_USERNAME: ${ADMIN_USERNAME}
    ADMIN_PASSWORD: ${ADMIN_PASSWORD}
    JWT_SECRET: ${JWT_SECRET}
  depends_on:
    db:
      condition: service_healthy
  restart: unless-stopped
```

**Points clés** :
- **Expose (pas ports)** : Le port 3007 est accessible uniquement dans le réseau Docker
- **Dépendance conditionnelle** : Attend que la base de données soit `healthy` avant de démarrer
- **Variables d'environnement** : Toutes lues depuis le fichier `.env`

#### Service Frontend

```yaml
frontend:
  build:
    context: .
  ports:
    - "8087:80"
  depends_on:
    - backend
  restart: unless-stopped
```

**Points clés** :
- **Mapping de port** : 8087 (hôte) → 80 (conteneur)
- **Dépendance simple** : Démarre après le backend (pas de condition de health check)

#### Volumes

```yaml
volumes:
  postgres_data:
```

Déclaration du volume nommé pour la persistance des données PostgreSQL.

---

##  Commandes utiles

### Gestion des conteneurs

```bash
# Arrêter les conteneurs 
docker compose stop

# Arrêter et supprimer les conteneurs 
docker compose down

# Arrêter, supprimer les conteneurs ET les volumes 
docker compose down -v

# Redémarrer les services
docker compose restart

# Redémarrer un service spécifique
docker compose restart backend
```

### Build et images

```bash
# Reconstruire toutes les images
docker compose build

# Reconstruire sans utiliser le cache
docker compose build --no-cache

# Reconstruire un service spécifique
docker compose build frontend

# Voir les images créées
docker images | grep quiz-app
```

### Accès aux conteneurs

```bash
# Accéder au shell du backend
docker compose exec backend sh

# Accéder à PostgreSQL
docker compose exec db psql -U quiz_user -d quiz_db

# Exécuter une commande dans un conteneur
docker compose exec backend npm test
```

### Logs et monitoring

```bash
# Logs en temps réel de tous les services
docker compose logs -f

# Logs des 100 dernières lignes
docker compose logs --tail=100

# Logs d'un service spécifique
docker compose logs -f backend

# Voir l'utilisation des ressources (CPU, mémoire)
docker stats

# Voir l'utilisation des ressources d'un conteneur spécifique
docker stats quiz-app-backend-1
```

### Nettoyage

```bash
# Supprimer les conteneurs arrêtés
docker compose rm

# Supprimer les images, conteneurs et volumes non utilisés
docker system prune -a --volumes

# Supprimer uniquement les images non utilisées
docker image prune -a
```

---

##  Dépannage

### Problème : Les services ne démarrent pas

**Symptômes** : `docker compose up` échoue ou les conteneurs se terminent immédiatement

**Solutions** :
1. Vérifiez que Docker Desktop est en cours d'exécution
2. Vérifiez les logs : `docker compose logs`
3. Vérifiez que les ports ne sont pas déjà utilisés :
   ```bash
   # Sur macOS/Linux
   lsof -i :8087
   
   # Sur Windows
   netstat -ano | findstr :8087
   ```
4. Vérifiez les permissions Docker

### Problème : Erreur de connexion à la base de données

**Symptômes** : Le backend ne peut pas se connecter à PostgreSQL

**Solutions** :
1. Vérifiez que le service `db` est `healthy` :
   ```bash
   docker compose ps
   ```
2. Vérifiez les variables d'environnement dans `.env`
3. Consultez les logs du service db :
   ```bash
   docker compose logs db
   ```
4. Vérifiez que le health check fonctionne :
   ```bash
   docker compose exec db pg_isready -U quiz_user -d quiz_db
   ```

### Problème : Le frontend ne compile pas

**Symptômes** : Erreur lors du build de l'image frontend

**Solutions** :
1. Vérifiez que `package.json` est présent à la racine
2. Vérifiez les logs du build :
   ```bash
   docker compose build frontend --no-cache
   ```
3. Testez le build localement :
   ```bash
   npm install
   npm run build
   ```

### Problème : Page 404 sur `/gestion-quiz`

**Solutions** :
1. Vérifiez que `gestion-quiz.html` est présent dans `public/`
2. Reconstruisez l'image frontend :
   ```bash
   docker compose build frontend
   docker compose up -d frontend
   ```

### Problème : Les données ne persistent pas

**Solutions** :
1. Vérifiez que le volume existe :
   ```bash
   docker volume ls | grep postgres_data
   ```
2. Vérifiez que vous utilisez `docker compose down` (sans `-v`) :
   ```bash
   #  Ne faites PAS ça si vous voulez garder les données
   docker compose down -v
   
   #  Utilisez ça pour garder les données
   docker compose down
   ```

---

##  Docker Hub 

Les images Docker peuvent être publiées sur Docker Hub pour un accès facile et une distribution simplifiée.


### Résumé des étapes

1. **Se connecter à Docker Hub**
   ```bash
   docker login
   ```

2. **Tagger les images**
   ```bash
   docker tag quiz-app-db oussamadghoughi/quiz-app-db:latest
   docker tag quiz-app-backend oussamadghoughi/quiz-app-backend:latest
   docker tag quiz-app-frontend oussamadghoughi/quiz-app-frontend:latest
   ```

3. **Publier les images**
   ```bash
   docker push oussamadghoughi/quiz-app-db:latest
   docker push oussamadghoughi/quiz-app-backend:latest
   docker push oussamadghoughi/quiz-app-frontend:latest
   ```

### Utiliser les images depuis Docker Hub

Une fois publiées, les images peuvent être utilisées directement :

```yaml
# Dans docker-compose.yml
services:
  db:
    image: oussamadghoughi/quiz-app-db:latest
    # ... reste de la configuration
```

---

##  Auteur

**Oussama Dghoughi**


**Dernière mise à jour** : Janvier 2026
