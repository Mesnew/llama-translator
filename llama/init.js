const fs = require("fs")
const path = require("path")

// Créer le dossier uploads s'il n'existe pas
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
    console.log("Création du dossier uploads...")
    fs.mkdirSync(uploadsDir, { recursive: true })
    console.log("Dossier uploads créé avec succès!")
} else {
    console.log("Le dossier uploads existe déjà.")
}

// Créer le fichier d'historique d'images s'il n'existe pas
const imageHistoryPath = path.join(__dirname, "image-history.json")
if (!fs.existsSync(imageHistoryPath)) {
    console.log("Création du fichier d'historique d'images...")
    fs.writeFileSync(imageHistoryPath, "[]")
    console.log("Fichier d'historique d'images créé avec succès!")
} else {
    console.log("Le fichier d'historique d'images existe déjà.")
}

console.log("Initialisation terminée. Le système est prêt à l'emploi!")
