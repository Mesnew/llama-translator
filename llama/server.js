const express = require("express")
const path = require("path")
const cors = require("cors")
const { exec, spawn } = require("child_process")
const util = require("util")
const fs = require("fs")
const os = require("os")
const { v4: uuidv4 } = require("uuid")

const execAsync = util.promisify(exec)
const app = express()
const port = 3000

// Stockage en mémoire pour l'historique des traductions
const translationHistory = []
const MAX_HISTORY_SIZE = 50 // Limiter la taille de l'historique

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname)))

// Créer le dossier uploads s'il n'existe pas
const uploadsDir = path.join(__dirname, "uploads")
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

// Route principale
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"))
})

// Route de statut
app.get("/status", (req, res) => {
  res.sendFile(path.join(__dirname, "status.html"))
})

// Route d'historique
app.get("/history", (req, res) => {
  res.sendFile(path.join(__dirname, "history.html"))
})

// Route pour les outils d'images
app.get("/image-tools", (req, res) => {
  res.sendFile(path.join(__dirname, "image-tools.html"))
})

// Route de débogage
app.get("/debug", (req, res) => {
  res.sendFile(path.join(__dirname, "debug.html"))
})

// API pour obtenir l'historique des traductions
app.get("/api/history", (req, res) => {
  res.json(translationHistory)
})

// API pour effacer l'historique
app.delete("/api/history", (req, res) => {
  translationHistory.length = 0
  res.json({ success: true, message: "Historique effacé" })
})

// API de traduction
app.post("/api/translate", async (req, res) => {
  try {
    const { text, sourceLanguage, targetLanguage, model = "llama2" } = req.body

    if (!text || !sourceLanguage || !targetLanguage) {
      return res.status(400).json({ error: "Texte ou langues manquants" })
    }

    // Fonction pour obtenir le nom complet de la langue à partir du code
    function getLanguageName(code) {
      const languages = {
        fr: "français",
        en: "anglais",
        es: "espagnol",
        de: "allemand",
        it: "italien",
        pt: "portugais",
        ru: "russe",
        zh: "chinois",
        ja: "japonais",
        ar: "arabe",
      }

      return languages[code] || code
    }

    let translatedText = ""
    let isSimulated = false

    try {
      // Créer un fichier temporaire pour le prompt
      const tempFile = path.join(os.tmpdir(), `prompt-${Date.now()}.txt`)

      // Construire le prompt pour Llama
      const prompt = `Traduis le texte suivant du ${getLanguageName(sourceLanguage)} vers le ${getLanguageName(targetLanguage)}. 
Retourne uniquement la traduction, sans explications ni commentaires.

Texte à traduire: "${text}"`

      // Écrire le prompt dans un fichier temporaire
      fs.writeFileSync(tempFile, prompt)

      // Utiliser spawn au lieu de exec pour un meilleur contrôle
      console.log(`Exécution de la commande: cat "${tempFile}" | ollama run ${model}`)

      // Utiliser une promesse pour gérer le processus spawn
      const result = await new Promise((resolve, reject) => {
        const ollamaProcess = spawn("sh", ["-c", `cat "${tempFile}" | ollama run ${model}`])

        let stdout = ""
        let stderr = ""

        ollamaProcess.stdout.on("data", (data) => {
          stdout += data.toString()
        })

        ollamaProcess.stderr.on("data", (data) => {
          stderr += data.toString()
        })

        ollamaProcess.on("close", (code) => {
          if (code !== 0 && !stderr.includes(`${model}:`)) {
            reject(new Error(`Processus terminé avec le code ${code}: ${stderr}`))
          } else {
            resolve({ stdout, stderr })
          }
        })

        ollamaProcess.on("error", (err) => {
          reject(err)
        })

        // Timeout de 30 secondes
        setTimeout(() => {
          ollamaProcess.kill()
          reject(new Error("Timeout: la traduction a pris trop de temps"))
        }, 30000)
      })

      // Supprimer le fichier temporaire
      fs.unlinkSync(tempFile)

      // Nettoyer la sortie pour obtenir uniquement la traduction
      translatedText = result.stdout

      // Supprimer les lignes d'information d'Ollama
      translatedText = translatedText
          .split("\n")
          .filter((line) => !line.includes(`${model}:`))
          .join("\n")

      // Supprimer les répétitions du prompt
      if (translatedText.includes("Texte à traduire:")) {
        translatedText = translatedText.split("Texte à traduire:")[1]
      }

      // Nettoyer les guillemets et espaces superflus
      translatedText = translatedText.replace(/^["'\s]+|["'\s]+$/g, "").trim()

      // Si la traduction est vide ou trop courte, considérer comme un échec
      if (translatedText.length < 2) {
        throw new Error("La traduction générée est trop courte ou vide")
      }
    } catch (error) {
      console.error("Erreur lors de l'exécution d'Ollama:", error)

      // Fallback vers la simulation si Ollama échoue
      console.log("Utilisation de la traduction simulée comme fallback")
      isSimulated = true

      // Dictionnaire minimal pour le fallback
      const fallbackMessage = `[Échec de la traduction avec Ollama. Veuillez vérifier que le service est en cours d'exécution. Texte original: "${text}"]`
      translatedText = fallbackMessage
    }

    // Ajouter à l'historique
    const timestamp = new Date().toISOString()
    const historyEntry = {
      id: Date.now().toString(),
      timestamp,
      sourceText: text,
      translatedText,
      sourceLanguage,
      targetLanguage,
      isSimulated,
      model,
    }

    // Ajouter au début de l'historique et limiter la taille
    translationHistory.unshift(historyEntry)
    if (translationHistory.length > MAX_HISTORY_SIZE) {
      translationHistory.pop()
    }

    const response = { translatedText }
    if (isSimulated) {
      response.warning = "Traduction simulée (Ollama n'a pas pu être utilisé)"
    }

    return res.json(response)
  } catch (error) {
    console.error("Erreur générale:", error)
    return res.status(500).json({
      error: "Erreur lors de la traduction",
      details: error.message || String(error),
    })
  }
})

// API de détection de langue (simulation)
app.post("/api/detect-language", (req, res) => {
  const { text } = req.body

  if (!text) {
    return res.status(400).json({ error: "Texte manquant" })
  }

  // Simulation simple de détection de langue
  const frenchWords = ["je", "tu", "il", "elle", "nous", "vous", "ils", "elles", "bonjour", "merci"]
  const englishWords = ["i", "you", "he", "she", "we", "they", "hello", "thank", "yes", "no"]
  const spanishWords = ["yo", "tú", "él", "ella", "nosotros", "vosotros", "ellos", "ellas", "hola"]

  const words = text.toLowerCase().split(/\W+/)

  let frenchCount = 0
  let englishCount = 0
  let spanishCount = 0

  words.forEach((word) => {
    if (frenchWords.includes(word)) frenchCount++
    if (englishWords.includes(word)) englishCount++
    if (spanishWords.includes(word)) spanishCount++
  })

  let detectedLanguage = "fr" // Par défaut
  let confidence = 0.5

  if (englishCount > frenchCount && englishCount > spanishCount) {
    detectedLanguage = "en"
    confidence = 0.7 + (englishCount / words.length) * 0.3
  } else if (spanishCount > frenchCount && spanishCount > englishCount) {
    detectedLanguage = "es"
    confidence = 0.7 + (spanishCount / words.length) * 0.3
  } else {
    confidence = 0.7 + (frenchCount / words.length) * 0.3
  }

  res.json({
    detectedLanguage,
    confidence: Math.min(confidence, 0.99),
  })
})

// API de statut pour Ollama
app.get("/api/status/ollama", async (req, res) => {
  try {
    const { stdout, stderr } = await execAsync("which ollama")

    if (stdout) {
      // Ollama est installé, obtenir la version
      try {
        const versionResult = await execAsync("ollama --version")
        const version = versionResult.stdout.trim()
        res.json({ installed: true, version })
      } catch (error) {
        res.json({ installed: true, version: null })
      }
    } else {
      res.json({ installed: false })
    }
  } catch (error) {
    res.json({ installed: false, error: error.message })
  }
})

// API de statut pour le modèle Llama2
app.get("/api/status/model", async (req, res) => {
  try {
    const { stdout, stderr } = await execAsync("ollama list")

    if (stdout.includes("llama2")) {
      res.json({ available: true })
    } else {
      res.json({ available: false })
    }
  } catch (error) {
    res.json({ available: false, error: error.message })
  }
})

// API pour lister les modèles disponibles
app.get("/api/models", async (req, res) => {
  try {
    const { stdout, stderr } = await execAsync("ollama list")

    // Analyser la sortie pour extraire les noms des modèles
    const models = stdout
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => {
          const parts = line.split(/\s+/)
          return parts[0] // Le nom du modèle est généralement le premier élément
        })
        .filter((model) => model && model !== "NAME") // Filtrer les en-têtes et les valeurs vides

    res.json({ models })
  } catch (error) {
    res.json({ models: ["llama2"], error: error.message })
  }
})

// API pour lister les modèles de génération d'images disponibles
app.get("/api/image-models", async (req, res) => {
  try {
    const { stdout, stderr } = await execAsync("ollama list")

    // Liste des modèles connus pour supporter la génération d'images
    const imageModelKeywords = ["stable-diffusion", "sd", "dall-e", "midjourney", "imagen", "llava"]

    // Analyser la sortie pour extraire les noms des modèles
    const allModels = stdout
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => {
          const parts = line.split(/\s+/)
          return parts[0].toLowerCase() // Le nom du modèle est généralement le premier élément
        })
        .filter((model) => model && model !== "name") // Filtrer les en-têtes et les valeurs vides

    // Filtrer pour trouver les modèles d'image probables
    const imageModels = allModels.filter((model) => imageModelKeywords.some((keyword) => model.includes(keyword)))

    if (imageModels.length > 0) {
      res.json({ models: imageModels })
    } else {
      // Pas de modèle d'image trouvé, suggérer d'en installer un
      res.json({
        models: [],
        message:
            "Aucun modèle de génération d'image détecté. Installez un modèle comme 'stable-diffusion' avec 'ollama pull stable-diffusion'.",
      })
    }
  } catch (error) {
    res.json({
      models: [],
      error: error.message,
      message: "Impossible de détecter les modèles d'image. Vérifiez qu'Ollama est installé.",
    })
  }
})

// API de test de traduction
app.get("/api/status/test", async (req, res) => {
  try {
    const testPrompt = "Traduis le mot 'test' du français vers l'anglais."
    const tempFile = path.join(os.tmpdir(), `test-prompt-${Date.now()}.txt`)

    fs.writeFileSync(tempFile, testPrompt)

    const { stdout, stderr } = await execAsync(`cat "${tempFile}" | ollama run llama2 --nowordwrap`)

    fs.unlinkSync(tempFile)

    if (stdout.toLowerCase().includes("test")) {
      res.json({ success: true })
    } else {
      res.json({ success: false, error: "La sortie ne contient pas la traduction attendue" })
    }
  } catch (error) {
    res.json({ success: false, error: error.message })
  }
})

// API pour obtenir les statistiques
app.get("/api/stats", (req, res) => {
  const totalTranslations = translationHistory.length

  // Calculer les langues les plus utilisées
  const sourceLangCount = {}
  const targetLangCount = {}

  translationHistory.forEach((entry) => {
    sourceLangCount[entry.sourceLanguage] = (sourceLangCount[entry.sourceLanguage] || 0) + 1
    targetLangCount[entry.targetLanguage] = (targetLangCount[entry.targetLanguage] || 0) + 1
  })

  // Calculer le nombre de traductions simulées vs réelles
  const simulatedCount = translationHistory.filter((entry) => entry.isSimulated).length
  const realCount = totalTranslations - simulatedCount

  res.json({
    totalTranslations,
    sourceLangCount,
    targetLangCount,
    simulatedCount,
    realCount,
  })
})

// Remplacer la fonction de génération d'image actuelle par cette version simplifiée
// API pour la génération d'images avec Ollama
app.post("/api/generate-image", async (req, res) => {
  console.log("Génération d'image appelée avec:", req.body)
  try {
    const { prompt, aspectRatio = "1:1", style = "photo", model = "fi4" } = req.body

    if (!prompt) {
      console.log("Erreur: prompt manquant")
      return res.status(400).json({ error: "Description (prompt) manquante" })
    }

    // Déterminer les dimensions en fonction du ratio d'aspect
    let width, height
    switch (aspectRatio) {
      case "16:9":
        width = 1024
        height = 576
        break
      case "9:16":
        width = 576
        height = 1024
        break
      case "4:3":
        width = 1024
        height = 768
        break
      case "1:1":
      default:
        width = 768
        height = 768
        break
    }

    console.log(`Tentative de génération d'image avec ${model}: ${width}x${height}, Style: ${style}, Prompt: ${prompt}`)

    try {
      // Vérifier d'abord si le modèle est disponible
      const { stdout: modelList } = await execAsync("ollama list")

      if (!modelList.toLowerCase().includes(model.toLowerCase())) {
        throw new Error(`Modèle ${model} non disponible. Veuillez l'installer avec 'ollama pull ${model}'`)
      }

      // Générer un nom de fichier unique
      const filename = `${Date.now()}-${uuidv4()}.png`
      const outputPath = path.join(uploadsDir, filename)

      // Créer une URL pour une image de placeholder avec le texte du prompt
      const placeholderUrl = `https://placehold.co/${width}x${height}/1a1a36/ffffff?text=${encodeURIComponent(prompt.substring(0, 50))}`

      // Télécharger l'image de placeholder
      const response = await fetch(placeholderUrl)
      const buffer = await response.arrayBuffer()

      // Sauvegarder l'image
      fs.writeFileSync(outputPath, Buffer.from(buffer))

      // Construire l'URL de l'image
      const imageUrl = `/uploads/${filename}`

      console.log(`Image générée avec succès: ${imageUrl}`)

      // Enregistrer dans l'historique local
      const imageHistoryPath = path.join(__dirname, "image-history.json")
      let imageHistory = []

      try {
        const historyData = fs.readFileSync(imageHistoryPath, "utf8")
        imageHistory = JSON.parse(historyData)
      } catch (error) {
        console.log("Création d'un nouvel historique d'images")
        imageHistory = []
      }

      imageHistory.unshift({
        id: Date.now().toString(),
        prompt,
        imageUrl,
        timestamp: new Date().toISOString(),
        aspectRatio,
        style,
        model,
      })

      // Limiter la taille de l'historique
      if (imageHistory.length > 20) {
        imageHistory.pop()
      }

      fs.writeFileSync(imageHistoryPath, JSON.stringify(imageHistory))

      return res.json({
        success: true,
        imageUrl,
        caption: prompt,
        aspectRatio,
        style,
        model,
        note: "Image générée comme placeholder. Llava est un modèle de compréhension d'images, pas de génération.",
      })
    } catch (error) {
      console.error("Erreur lors de la génération d'image avec Ollama:", error)

      // Fallback vers une image de placeholder si la génération échoue
      console.log("Utilisation du placeholder comme fallback")

      const imageUrl = `/placeholder.svg?height=${height}&width=${width}&text=${encodeURIComponent(prompt)}`

      return res.json({
        success: false,
        imageUrl,
        caption: prompt,
        aspectRatio,
        style,
        error: error.message,
        fallback: true,
      })
    }
  } catch (error) {
    console.error("Erreur de génération d'image:", error)
    res.status(500).json({ error: "Erreur lors de la génération de l'image", details: error.message })
  }
})

// API de test pour la génération d'images
app.get("/api/test-image-generation", (req, res) => {
  console.log("Test de génération d'image appelé")
  res.json({
    success: true,
    message: "L'API de génération d'images fonctionne",
    testImageUrl: `/placeholder.svg?height=300&width=300&text=${encodeURIComponent("Test d'image")}`,
  })
})

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Serveur démarré sur http://localhost:${port}`)
  console.log(`Page de statut disponible sur http://localhost:${port}/status`)
  console.log(`Historique des traductions disponible sur http://localhost:${port}/history`)
  console.log(`Outils d'images disponibles sur http://localhost:${port}/image-tools`)

  // Créer le fichier d'historique d'images s'il n'existe pas
  const imageHistoryPath = path.join(__dirname, "image-history.json")
  if (!fs.existsSync(imageHistoryPath)) {
    fs.writeFileSync(imageHistoryPath, "[]")
  }
})
