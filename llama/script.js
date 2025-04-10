document.addEventListener("DOMContentLoaded", () => {
  const sourceLanguageSelect = document.getElementById("sourceLanguage")
  const targetLanguageSelect = document.getElementById("targetLanguage")
  const sourceTextArea = document.getElementById("sourceText")
  const translatedTextArea = document.getElementById("translatedText")
  const translateButton = document.getElementById("translateButton")
  const swapButton = document.getElementById("swapButton")
  const detectButton = document.getElementById("detectButton")
  const detectedLanguageSpan = document.getElementById("detectedLanguage")
  const modelSelect = document.getElementById("model-select")
  const speakButton = document.getElementById("speakButton")
  const copyButton = document.getElementById("copyButton")
  const shareButton = document.getElementById("shareButton")
  const favoriteButton = document.getElementById("favoriteButton")
  const sourceCharCount = document.getElementById("sourceCharCount")
  const translatedCharCount = document.getElementById("translatedCharCount")

  // Charger les modèles disponibles
  async function loadModels() {
    try {
      const response = await fetch("/api/models")
      const data = await response.json()

      if (data.models && data.models.length > 0) {
        // Vider le select
        modelSelect.innerHTML = ""

        // Ajouter les modèles
        data.models.forEach((model) => {
          const option = document.createElement("option")
          option.value = model
          option.textContent = model.charAt(0).toUpperCase() + model.slice(1)
          modelSelect.appendChild(option)
        })
      }
    } catch (error) {
      console.error("Erreur lors du chargement des modèles:", error)
    }
  }

  // Fonction pour mettre à jour le compteur de caractères
  function updateCharCount() {
    sourceCharCount.textContent = `${sourceTextArea.value.length} caractères`
    translatedCharCount.textContent = `${translatedTextArea.value.length} caractères`
  }

  // Vérifier les paramètres d'URL pour pré-remplir les champs
  function checkUrlParams() {
    const params = new URLSearchParams(window.location.search)

    if (params.has("sourceText")) {
      sourceTextArea.value = params.get("sourceText")
    }

    if (params.has("sourceLanguage")) {
      sourceLanguageSelect.value = params.get("sourceLanguage")
    }

    if (params.has("targetLanguage")) {
      targetLanguageSelect.value = params.get("targetLanguage")
    }

    updateCharCount()
  }

  translateButton.addEventListener("click", async () => {
    const sourceText = sourceTextArea.value.trim()
    if (!sourceText) return

    const sourceLanguage = sourceLanguageSelect.value
    const targetLanguage = targetLanguageSelect.value
    const selectedModel = modelSelect.value

    // Désactiver le bouton et afficher l'état de chargement
    translateButton.disabled = true
    translateButton.innerHTML = '<span class="loading"></span> Traduction en cours...'

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: sourceText,
          sourceLanguage,
          targetLanguage,
          model: selectedModel,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        translatedTextArea.value = data.translatedText
        updateCharCount()

        // Afficher un avertissement si la traduction est simulée
        if (data.warning) {
          console.warn(data.warning)
        }
      } else {
        translatedTextArea.value = `Erreur: ${data.error || "Erreur inconnue"}`
      }
    } catch (error) {
      console.error("Erreur:", error)
      translatedTextArea.value = "Erreur lors de la traduction. Veuillez réessayer."
    } finally {
      // Réactiver le bouton et restaurer le texte
      translateButton.disabled = false
      translateButton.textContent = "Traduire"
    }
  })

  swapButton.addEventListener("click", () => {
    const tempLang = sourceLanguageSelect.value
    sourceLanguageSelect.value = targetLanguageSelect.value
    targetLanguageSelect.value = tempLang

    // Swap texts if there's translated content
    if (translatedTextArea.value) {
      const tempText = sourceTextArea.value
      sourceTextArea.value = translatedTextArea.value
      translatedTextArea.value = tempText
      updateCharCount()
    }
  })

  // Détection de langue
  detectButton.addEventListener("click", async () => {
    const sourceText = sourceTextArea.value.trim()
    if (!sourceText) return

    detectButton.disabled = true
    detectButton.textContent = "Détection..."

    try {
      const response = await fetch("/api/detect-language", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: sourceText,
        }),
      })

      const data = await response.json()

      if (response.ok && data.detectedLanguage) {
        sourceLanguageSelect.value = data.detectedLanguage

        // Afficher la confiance
        const confidence = Math.round(data.confidence * 100)
        detectedLanguageSpan.textContent = `(confiance: ${confidence}%)`

        // Effacer après 5 secondes
        setTimeout(() => {
          detectedLanguageSpan.textContent = ""
        }, 5000)
      }
    } catch (error) {
      console.error("Erreur lors de la détection de la langue:", error)
    } finally {
      detectButton.disabled = false
      detectButton.textContent = "Détecter la langue"
    }
  })

  // Synthèse vocale
  speakButton.addEventListener("click", () => {
    const text = translatedTextArea.value.trim()
    if (!text) return

    // Utiliser l'API Web Speech
    const utterance = new SpeechSynthesisUtterance(text)

    // Définir la langue en fonction de la langue cible
    utterance.lang = targetLanguageSelect.value

    // Lire le texte
    window.speechSynthesis.speak(utterance)
  })

  // Copier la traduction
  copyButton.addEventListener("click", () => {
    const text = translatedTextArea.value.trim()
    if (!text) return

    navigator.clipboard.writeText(text).then(() => {
      const originalText = copyButton.innerHTML
      copyButton.innerHTML = `
        <svg class="feature-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copié !
      `

      setTimeout(() => {
        copyButton.innerHTML = originalText
      }, 2000)
    })
  })

  // Partager la traduction
  shareButton.addEventListener("click", () => {
    const sourceText = sourceTextArea.value.trim()
    const translatedText = translatedTextArea.value.trim()

    if (!sourceText || !translatedText) return

    // Créer le texte à partager
    const shareText = `Traduction de ${sourceLanguageSelect.options[sourceLanguageSelect.selectedIndex].text} vers ${targetLanguageSelect.options[targetLanguageSelect.selectedIndex].text}:\n\nOriginal: ${sourceText}\n\nTraduction: ${translatedText}`

    // Vérifier si l'API Web Share est disponible
    if (navigator.share) {
      navigator
          .share({
            title: "Traduction Ollama",
            text: shareText,
          })
          .catch((error) => {
            console.error("Erreur lors du partage:", error)
            fallbackShare()
          })
    } else {
      fallbackShare()
    }

    // Méthode de secours pour le partage
    function fallbackShare() {
      navigator.clipboard.writeText(shareText).then(() => {
        alert("Le texte de partage a été copié dans le presse-papiers.")
      })
    }
  })

  // Gestion des favoris
  const favorites = JSON.parse(localStorage.getItem("translationFavorites") || "[]")

  favoriteButton.addEventListener("click", () => {
    const sourceText = sourceTextArea.value.trim()
    const translatedText = translatedTextArea.value.trim()

    if (!sourceText || !translatedText) return

    // Créer un nouvel élément favori
    const favorite = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      sourceText,
      translatedText,
      sourceLanguage: sourceLanguageSelect.value,
      targetLanguage: targetLanguageSelect.value,
    }

    // Vérifier si cet élément existe déjà
    const exists = favorites.some(
        (f) =>
            f.sourceText === sourceText &&
            f.translatedText === translatedText &&
            f.sourceLanguage === sourceLanguageSelect.value &&
            f.targetLanguage === targetLanguageSelect.value,
    )

    if (!exists) {
      // Ajouter au début du tableau
      favorites.unshift(favorite)

      // Limiter à 20 favoris
      if (favorites.length > 20) {
        favorites.pop()
      }

      // Sauvegarder dans le localStorage
      localStorage.setItem("translationFavorites", JSON.stringify(favorites))

      // Mettre à jour l'apparence du bouton
      favoriteButton.classList.add("active")

      setTimeout(() => {
        favoriteButton.classList.remove("active")
      }, 2000)
    } else {
      alert("Cette traduction est déjà dans vos favoris.")
    }
  })

  // Disable translate button if source text is empty
  sourceTextArea.addEventListener("input", () => {
    translateButton.disabled = !sourceTextArea.value.trim()
    updateCharCount()
  })

  // Initialisation
  loadModels()
  checkUrlParams()
  updateCharCount()
})
