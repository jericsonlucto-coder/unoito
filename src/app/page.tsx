'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'

// #region TYPES
interface CardType {
    color: string
    value: number
    points: number
    changeTurn: boolean
    drawValue: number
    src: string
    playedByPlayer: boolean
}
// #endregion

// #region CARD CLASS
class Card implements CardType {
    color: string
    value: number
    points: number
    changeTurn: boolean
    drawValue: number
    src: string
    playedByPlayer: boolean

    constructor(
        color: string,
        value: number,
        points: number,
        changeTurn: boolean,
        drawValue: number,
        src: string
    ) {
        this.color = color
        this.value = value
        this.points = points
        this.changeTurn = changeTurn
        this.drawValue = drawValue
        this.src = src
        this.playedByPlayer = false
    }
}
// #endregion

// #region DECK FUNCTIONS
const createCard = (rgb: string, color: string, deck: CardType[]): void => {
    for (let i = 0; i <= 14; i++) {
        if (i === 0) {
            deck.push(new Card(rgb, i, i, true, 0, `/images/${color}${i}.png`))
        } else if (i > 0 && i <= 9) {
            deck.push(new Card(rgb, i, i, true, 0, `/images/${color}${i}.png`))
            deck.push(new Card(rgb, i, i, true, 0, `/images/${color}${i}.png`))
        } else if (i === 10 || i === 11) {
            deck.push(new Card(rgb, i, 20, false, 0, `/images/${color}${i}.png`))
            deck.push(new Card(rgb, i, 20, false, 0, `/images/${color}${i}.png`))
        } else if (i === 12) {
            deck.push(new Card(rgb, i, 20, false, 2, `/images/${color}${i}.png`))
            deck.push(new Card(rgb, i, 20, false, 2, `/images/${color}${i}.png`))
        } else if (i === 13) {
            deck.push(new Card('any', i, 50, true, 0, `/images/wild13.png`))
        } else if (i === 14) {
            deck.push(new Card('any', i, 50, true, 4, `/images/wild14.png`))
        }
    }
}

const createDeck = (): CardType[] => {
    const deck: CardType[] = []
    const colors = [
        { rgb: 'rgb(255, 6, 0)', name: 'red' },
        { rgb: 'rgb(0, 170, 69)', name: 'green' },
        { rgb: 'rgb(0, 150, 224)', name: 'blue' },
        { rgb: 'rgb(255, 222, 0)', name: 'yellow' },
    ]
    colors.forEach(({ rgb, name }) => createCard(rgb, name, deck))
    return deck
}

const shuffleDeck = (deck: CardType[]): CardType[] => {
    const shuffled = [...deck]
    for (let i = shuffled.length - 1; i > 0; i--) {
        shuffled[i].playedByPlayer = false
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
}
// #endregion

// #region AUDIO
class AudioManager {
    private sounds: Record<string, HTMLAudioElement> = {}

    init() {
        if (typeof window === 'undefined') return
        this.sounds = {
            shuffle:     new Audio('/audio/shuffle.wav'),
            playCard:    new Audio('/audio/playCardNew.wav'),
            playCard2:   new Audio('/audio/playCard2.wav'),
            drawCard:    new Audio('/audio/drawCard.wav'),
            winRound:    new Audio('/audio/winRound.wav'),
            winGame:     new Audio('/audio/winGame.wav'),
            lose:        new Audio('/audio/lose.wav'),
            plusCard:    new Audio('/audio/plusCard.wav'),
            uno:         new Audio('/audio/uno.wav'),
            colorButton: new Audio('/audio/colorButton.wav'),
            playAgain:   new Audio('/audio/playAgain.wav'),
        }
    }

    play(sound: string) {
        if (this.sounds[sound]) {
            this.sounds[sound].currentTime = 0
            this.sounds[sound].play().catch(() => {})
        }
    }

    playCardSound() {
        this.play('playCard2')
    }
}

const audioManager = new AudioManager()
// #endregion

const GAME_OVER_SCORE = 100

export default function UnoGame() {

    // #region STATE
    const [cpuHand,         setCpuHand]         = useState<CardType[]>([])
    const [playerHand,      setPlayerHand]      = useState<CardType[]>([])
    const [deckState,       setDeckState]       = useState<CardType[]>([])
    const [playPile,        setPlayPile]        = useState<CardType[]>([])
    const [cpuScore,        setCpuScore]        = useState(0)
    const [playerScore,     setPlayerScore]     = useState(0)
    const [playerTurn,      setPlayerTurn]      = useState(true)
    const [gameOn,          setGameOn]          = useState(false)
    const [colorPickerOpen, setColorPickerOpen] = useState(false)
    const [showUnoPlayer,   setShowUnoPlayer]   = useState(false)
    const [showUnoCpu,      setShowUnoCpu]      = useState(false)
    const [roundVisible,    setRoundVisible]    = useState(false)
    const [roundWinner,     setRoundWinner]     = useState<'player' | 'cpu' | null>(null)
    const [gameVisible,     setGameVisible]     = useState(false)
    const [gameWinner,      setGameWinner]      = useState<'player' | 'cpu' | null>(null)
    const [cpuVisible,      setCpuVisible]      = useState(false)
    const [wildCardColor,   setWildCardColor]   = useState<string>('')
    const [selectedWildColor, setSelectedWildColor] = useState<string>('')
    const [isDrawing,       setIsDrawing]       = useState(false) // Add this state to prevent double drawing
    // #endregion

    // #region REFS
    const playerTurnRef    = useRef(playerTurn)
    const gameOnRef        = useRef(gameOn)
    const cpuHandRef       = useRef(cpuHand)
    const playerHandRef    = useRef(playerHand)
    const deckRef          = useRef(deckState)
    const playPileRef      = useRef(playPile)
    const colorPickerRef   = useRef(colorPickerOpen)
    const cpuScoreRef      = useRef(cpuScore)
    const playerScoreRef   = useRef(playerScore)
    const wildCardColorRef = useRef(wildCardColor)
    const selectedWildColorRef = useRef(selectedWildColor)
    const isDrawingRef     = useRef(false) // Add ref for drawing lock

    useEffect(() => { playerTurnRef.current  = playerTurn    }, [playerTurn])
    useEffect(() => { gameOnRef.current      = gameOn        }, [gameOn])
    useEffect(() => { cpuHandRef.current     = cpuHand       }, [cpuHand])
    useEffect(() => { playerHandRef.current  = playerHand    }, [playerHand])
    useEffect(() => { deckRef.current        = deckState     }, [deckState])
    useEffect(() => { playPileRef.current    = playPile      }, [playPile])
    useEffect(() => { colorPickerRef.current = colorPickerOpen }, [colorPickerOpen])
    useEffect(() => { cpuScoreRef.current    = cpuScore      }, [cpuScore])
    useEffect(() => { playerScoreRef.current = playerScore   }, [playerScore])
    useEffect(() => { wildCardColorRef.current = wildCardColor }, [wildCardColor])
    useEffect(() => { selectedWildColorRef.current = selectedWildColor }, [selectedWildColor])
    useEffect(() => { isDrawingRef.current = isDrawing }, [isDrawing])
    // #endregion

    // #region AUDIO INIT
    useEffect(() => {
        audioManager.init()
    }, [])
    // #endregion

    // #region HELPERS
    const getCpuDelay = useCallback(() => {
        return Math.floor((Math.random() * cpuHandRef.current.length * 200) + 1500)
    }, [])

    const drawCardLogic = useCallback((
        hand: CardType[],
        deck: CardType[],
        pile: CardType[]
    ): { newHand: CardType[], newDeck: CardType[], newPlayPile: CardType[] } => {
        let newDeck      = [...deck]
        let newPlayPile  = [...pile]
        const newHand    = [...hand]

        if (newDeck.length > 0) {
            newHand.push(newDeck.shift()!)
        } else {
            newDeck     = shuffleDeck(newPlayPile.slice(0, -1))
            newPlayPile = [newPlayPile[newPlayPile.length - 1]]
            newHand.push(newDeck.shift()!)
        }

        audioManager.play('drawCard')
        return { newHand, newDeck, newPlayPile }
    }, [])

    const triggerUno = useCallback((who: 'player' | 'cpu') => {
        audioManager.play('uno')
        if (who === 'player') {
            setShowUnoPlayer(true)
            setTimeout(() => setShowUnoPlayer(false), 2000)
        } else {
            setShowUnoCpu(true)
            setTimeout(() => setShowUnoCpu(false), 2000)
        }
    }, [])

    const tallyPoints = useCallback((loserHand: CardType[]): number => {
        return loserHand.reduce((sum, card) => sum + card.points, 0)
    }, [])
    // #endregion

    // #region NEW HAND
    const newHand = useCallback(() => {
        setGameOn(true)
        gameOnRef.current = true
        setColorPickerOpen(false)
        colorPickerRef.current = false
        setWildCardColor('')
        setSelectedWildColor('')
        setIsDrawing(false)
        isDrawingRef.current = false

        let newDeck = createDeck()
        newDeck = shuffleDeck(newDeck)
        audioManager.play('shuffle')

        const newCpuHand:    CardType[] = []
        const newPlayerHand: CardType[] = []
        for (let i = 0; i < 7; i++) {
            newCpuHand.push(newDeck.shift()!)
            newPlayerHand.push(newDeck.shift()!)
        }

        let startCard: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) {
            if (newDeck[i].color !== 'any' && newDeck[i].value <= 9) {
                startCard = newDeck.splice(i, 1)[0]
                break
            }
        }

        const newPlayPile = startCard ? [startCard] : []

        setCpuHand(newCpuHand)
        setPlayerHand(newPlayerHand)
        setDeckState(newDeck)
        setPlayPile(newPlayPile)

        cpuHandRef.current    = newCpuHand
        playerHandRef.current = newPlayerHand
        deckRef.current       = newDeck
        playPileRef.current   = newPlayPile
    }, [])
    // #endregion

    // #region CHECK FOR WINNER
    const checkForWinner = useCallback((
        pScore: number,
        cScore: number,
        pHand:  CardType[],
        cHand:  CardType[]
    ) => {
        if (pScore < GAME_OVER_SCORE && cScore < GAME_OVER_SCORE) {
            if (pHand.length === 0) {
                audioManager.play('winRound')
                setRoundWinner('player')
                setRoundVisible(true)
                setGameOn(false)
                gameOnRef.current = false
                setTimeout(() => {
                    setRoundVisible(false)
                    newHand()
                }, 3000)
            } else if (cHand.length === 0) {
                audioManager.play('lose')
                setRoundWinner('cpu')
                setRoundVisible(true)
                setGameOn(false)
                gameOnRef.current = false
                setTimeout(() => {
                    setRoundVisible(false)
                    newHand()
                }, 3000)
            }
        } else {
            setGameOn(false)
            gameOnRef.current = false
            if (pScore >= GAME_OVER_SCORE) {
                audioManager.play('lose')
                setGameWinner('cpu')
            } else {
                audioManager.play('winGame')
                setGameWinner('player')
            }
            setGameVisible(true)
        }
    }, [newHand])
    // #endregion

    // #region CPU LOGIC
    const playCPU = useCallback(() => {
        if (playerTurnRef.current || !gameOnRef.current) return

        const currentCpuHand    = [...cpuHandRef.current]
        const currentPlayerHand = [...playerHandRef.current]
        const currentDeck       = [...deckRef.current]
        const currentPlayPile   = [...playPileRef.current]
        const topCard           = currentPlayPile[currentPlayPile.length - 1]

        const playable:   CardType[] = []
        const remaining:  CardType[] = []

        for (const card of currentCpuHand) {
            if (
                card.color === topCard.color ||
                card.value === topCard.value ||
                card.color === 'any'         ||
                topCard.color === 'any'
            ) {
                playable.push(card)
            } else {
                remaining.push(card)
            }
        }

        if (playable.length === 0) {
            const { newHand: newCpu, newDeck, newPlayPile } = drawCardLogic(
                remaining, currentDeck, currentPlayPile
            )
            setCpuHand(newCpu)
            cpuHandRef.current = newCpu
            setDeckState(newDeck)
            deckRef.current = newDeck
            setPlayPile(newPlayPile)
            playPileRef.current = newPlayPile

            setTimeout(() => {
                setPlayerTurn(true)
                playerTurnRef.current = true
            }, 500)
            return
        }

        let chosenCard:    CardType
        let leftoverCards: CardType[]

        if (playable.length === 1) {
            chosenCard    = playable[0]
            leftoverCards = remaining
        } else {
            const strategist   = Math.random()
            const lastCard     = currentPlayPile[currentPlayPile.length - 1]
            const secondLast   = currentPlayPile[currentPlayPile.length - 2]
            const useHighCard  =
                currentPlayPile.length > 2 && (
                    strategist > 0.7 ||
                    currentPlayerHand.length < 3 ||
                    currentCpuHand.length > currentPlayerHand.length * 2 ||
                    (lastCard?.playedByPlayer   && lastCard?.drawValue > 0) ||
                    (secondLast?.playedByPlayer && lastCard?.drawValue  > 0)
                )

            let cardIndex = 0
            if (useHighCard) {
                let highest = 0
                playable.forEach((card, i) => {
                    if (card.value > highest) { highest = card.value; cardIndex = i }
                })
            } else {
                let lowest = 14
                playable.forEach((card, i) => {
                    if (card.value < lowest) { lowest = card.value; cardIndex = i }
                })
            }

            const leftoverPlayable = [...playable]
            chosenCard    = leftoverPlayable.splice(cardIndex, 1)[0]
            leftoverCards = [...remaining, ...leftoverPlayable]
        }

        setTimeout(() => {
            audioManager.playCardSound()

            const newPlayPile = [...currentPlayPile, { ...chosenCard, playedByPlayer: false }]
            let newCpuHand    = [...leftoverCards]

            if (chosenCard.color === 'any' && chosenCard.drawValue === 0) {
                const colors    = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
                const counts    = [0, 0, 0, 0]
                for (const card of newCpuHand) {
                    colors.forEach((color, i) => { if (card.color === color) counts[i]++ })
                }
                const pickedColor = colors[counts.indexOf(Math.max(...counts))]
                newPlayPile[newPlayPile.length - 1].color = pickedColor
                setWildCardColor(pickedColor)
                setSelectedWildColor(pickedColor)
                wildCardColorRef.current = pickedColor
                selectedWildColorRef.current = pickedColor
            }

            setPlayPile(newPlayPile)
            playPileRef.current = newPlayPile
            setCpuHand(newCpuHand)
            cpuHandRef.current = newCpuHand

            if (newCpuHand.length === 1) triggerUno('cpu')

            if (chosenCard.drawValue > 0) {
                audioManager.play('plusCard')
                let updatedPlayerHand = [...currentPlayerHand]
                let updatedDeck       = [...currentDeck]
                let updatedPlayPile   = [...newPlayPile]

                for (let i = 0; i < chosenCard.drawValue; i++) {
                    const result      = drawCardLogic(updatedPlayerHand, updatedDeck, updatedPlayPile)
                    updatedPlayerHand = result.newHand
                    updatedDeck       = result.newDeck
                    updatedPlayPile   = result.newPlayPile
                }

                setPlayerHand(updatedPlayerHand)
                playerHandRef.current = updatedPlayerHand
                setDeckState(updatedDeck)
                deckRef.current = updatedDeck
                setPlayPile(updatedPlayPile)
                playPileRef.current = updatedPlayPile
            }

            if (newCpuHand.length === 0) {
                setTimeout(() => {
                    const points      = tallyPoints(playerHandRef.current)
                    const newCpuScore = cpuScoreRef.current + points
                    setCpuScore(newCpuScore)
                    cpuScoreRef.current = newCpuScore
                    checkForWinner(playerScoreRef.current, newCpuScore, playerHandRef.current, newCpuHand)
                }, 1200)
                return
            }

            if (chosenCard.changeTurn) {
                setPlayerTurn(true)
                playerTurnRef.current = true
            } else {
                setTimeout(playCPU, getCpuDelay())
            }
        }, 300)
    }, [drawCardLogic, triggerUno, tallyPoints, checkForWinner, getCpuDelay])
    // #endregion

    // #region PLAYER ACTIONS
    const handlePlayerCardClick = useCallback((index: number) => {
        if (!playerTurnRef.current || colorPickerRef.current || !gameOnRef.current) return

        const currentPlayerHand = [...playerHandRef.current]
        const currentPlayPile   = [...playPileRef.current]
        const topCard           = currentPlayPile[currentPlayPile.length - 1]
        const card              = currentPlayerHand[index]

        const isPlayable =
            card.value === topCard.value ||
            card.color === topCard.color ||
            card.color === 'any'         ||
            topCard.color === 'any'

        if (!isPlayable) return

        audioManager.playCardSound()

        const newPlayerHand = currentPlayerHand.filter((_, i) => i !== index)
        const playedCard    = { ...card, playedByPlayer: true }
        const newPlayPile   = [...currentPlayPile, playedCard]

        setPlayerHand(newPlayerHand)
        playerHandRef.current = newPlayerHand
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile

        if (playedCard.color !== 'any') {
            setWildCardColor('')
            setSelectedWildColor('')
            wildCardColorRef.current = ''
            selectedWildColorRef.current = ''
        }

        if (newPlayerHand.length === 1) triggerUno('player')

        if (playedCard.drawValue > 0) {
            audioManager.play('plusCard')
            let updatedCpuHand  = [...cpuHandRef.current]
            let updatedDeck     = [...deckRef.current]
            let updatedPlayPile = [...newPlayPile]

            for (let i = 0; i < playedCard.drawValue; i++) {
                const result    = drawCardLogic(updatedCpuHand, updatedDeck, updatedPlayPile)
                updatedCpuHand  = result.newHand
                updatedDeck     = result.newDeck
                updatedPlayPile = result.newPlayPile
            }

            setCpuHand(updatedCpuHand)
            cpuHandRef.current = updatedCpuHand
            setDeckState(updatedDeck)
            deckRef.current = updatedDeck
            setPlayPile(updatedPlayPile)
            playPileRef.current = updatedPlayPile
        }

        if (newPlayerHand.length === 0) {
            setTimeout(() => {
                const points         = tallyPoints(cpuHandRef.current)
                const newPlayerScore = playerScoreRef.current + points
                setPlayerScore(newPlayerScore)
                playerScoreRef.current = newPlayerScore
                checkForWinner(newPlayerScore, cpuScoreRef.current, newPlayerHand, cpuHandRef.current)
            }, 1200)
            return
        }

        if (playedCard.color === 'any' && playedCard.drawValue === 0) {
            setColorPickerOpen(true)
            colorPickerRef.current = true
            return
        }

        if (playedCard.changeTurn) {
            setPlayerTurn(false)
            playerTurnRef.current = false
            setTimeout(playCPU, getCpuDelay())
        }
    }, [drawCardLogic, triggerUno, tallyPoints, checkForWinner, playCPU, getCpuDelay])

    const handleDrawPileClick = useCallback(() => {
        // Prevent multiple draws while already drawing
        if (!playerTurnRef.current || colorPickerRef.current || !gameOnRef.current || isDrawingRef.current) return
        
        // Set drawing lock
        setIsDrawing(true)
        isDrawingRef.current = true

        const { newHand: newPlayerHand, newDeck, newPlayPile } = drawCardLogic(
            playerHandRef.current,
            deckRef.current,
            playPileRef.current
        )

        setPlayerHand(newPlayerHand)
        playerHandRef.current = newPlayerHand
        setDeckState(newDeck)
        deckRef.current = newDeck
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile

        setTimeout(() => {
            setPlayerTurn(false)
            playerTurnRef.current = false
            // Release drawing lock after the action is complete
            setTimeout(() => {
                setIsDrawing(false)
                isDrawingRef.current = false
            }, 500)
            setTimeout(playCPU, getCpuDelay())
        }, 500)
    }, [drawCardLogic, playCPU, getCpuDelay])

    const handleColorChosen = useCallback((color: string, colorName: string) => {
        audioManager.play('colorButton')
        const newPlayPile = [...playPileRef.current]
        const lastCard = newPlayPile[newPlayPile.length - 1]
        
        newPlayPile[newPlayPile.length - 1] = {
            ...lastCard,
            color: color,
        }
        
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile
        setColorPickerOpen(false)
        colorPickerRef.current = false
        
        setWildCardColor(color)
        setSelectedWildColor(color)
        wildCardColorRef.current = color
        selectedWildColorRef.current = color
        
        const playArea = document.querySelector('.play-area') as HTMLElement
        if (playArea) {
            const originalBg = playArea.style.backgroundColor
            playArea.style.transition = 'background-color 0.3s ease'
            switch(colorName) {
                case 'red':
                    playArea.style.backgroundColor = 'rgba(255, 6, 0, 0.2)'
                    break
                case 'green':
                    playArea.style.backgroundColor = 'rgba(0, 170, 69, 0.2)'
                    break
                case 'blue':
                    playArea.style.backgroundColor = 'rgba(0, 150, 224, 0.2)'
                    break
                case 'yellow':
                    playArea.style.backgroundColor = 'rgba(255, 222, 0, 0.2)'
                    break
            }
            setTimeout(() => {
                playArea.style.backgroundColor = originalBg || ''
            }, 500)
        }
        
        setPlayerTurn(false)
        playerTurnRef.current = false
        
        setTimeout(playCPU, getCpuDelay())
    }, [playCPU, getCpuDelay])
    // #endregion

    // #region PLAY AGAIN
    const handlePlayAgain = useCallback(() => {
        audioManager.play('playAgain')
        setGameVisible(false)
        setPlayerScore(0)
        setCpuScore(0)
        playerScoreRef.current = 0
        cpuScoreRef.current    = 0
        setWildCardColor('')
        setSelectedWildColor('')
        setIsDrawing(false)
        isDrawingRef.current = false
        newHand()
    }, [newHand])
    // #endregion

    // #region DEV MODE
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase()
            if (key === 'p') {
                setPlayerTurn(true)
                playerTurnRef.current = true
            }
            if (key === 'c') {
                const { newHand: newCpu, newDeck, newPlayPile } = drawCardLogic(
                    cpuHandRef.current, deckRef.current, playPileRef.current
                )
                setCpuHand(newCpu)
                cpuHandRef.current  = newCpu
                setDeckState(newDeck)
                deckRef.current     = newDeck
                setPlayPile(newPlayPile)
                playPileRef.current = newPlayPile
            }
            if (key === 'x') {
                const updated = [...playerHandRef.current]
                updated.pop()
                setPlayerHand(updated)
                playerHandRef.current = updated
            }
            if (key === 'z') {
                const updated = [...cpuHandRef.current]
                updated.pop()
                setCpuHand(updated)
                cpuHandRef.current = updated
            }
            if (key === 'w') {
                const wild    = new Card('any', 13, 50, true, 0, '/images/wild13.png')
                const updated = [...playerHandRef.current, wild]
                setPlayerHand(updated)
                playerHandRef.current = updated
            }
            if (key === '4') {
                const wild4   = new Card('any', 14, 50, true, 4, '/images/wild14.png')
                const updated = [...playerHandRef.current, wild4]
                setPlayerHand(updated)
                playerHandRef.current = updated
            }
            if (key === '=') {
                const newScore         = playerScoreRef.current + 10
                setPlayerScore(newScore)
                playerScoreRef.current = newScore
            }
            if (key === 's') {
                setCpuVisible(prev => !prev)
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [drawCardLogic])
    // #endregion

    // start game on mount
    useEffect(() => {
        newHand()
    }, [])

    // cpu auto play
    useEffect(() => {
        if (!playerTurn && gameOn) {
            const timer = setTimeout(playCPU, getCpuDelay())
            return () => clearTimeout(timer)
        }
    }, [playerTurn, gameOn, playCPU, getCpuDelay])

    const topCard = playPile[playPile.length - 1]
    
    // Helper to get card name
    const getCardName = (card: CardType) => {
        if (card.color === 'any') {
            return card.drawValue === 4 ? 'Wild Draw 4' : 'Wild Card'
        }
        const colorNames: Record<string, string> = {
            'rgb(255, 6, 0)': 'Red',
            'rgb(0, 170, 69)': 'Green',
            'rgb(0, 150, 224)': 'Blue',
            'rgb(255, 222, 0)': 'Yellow'
        }
        const valueNames: Record<number, string> = {
            10: 'Skip',
            11: 'Reverse',
            12: 'Draw 2',
            13: 'Wild Card',
            14: 'Wild Draw 4'
        }
        const value = valueNames[card.value] || card.value.toString()
        
        if (card.value === 13 && card.color !== 'any') {
            return `${colorNames[card.color]} Wild Card`
        }
        
        return `${colorNames[card.color] || card.color} ${value}`
    }

    // #region JSX
    return (
        <main>
            {/* CPU BOX */}
            <div className='cpu-box'>
                <div className='cpu-hand'>
                    {cpuHand.map((card, i) => (
                        <Image
                            key={i}
                            src={cpuVisible ? card.src : '/images/back.png'}
                            alt='cpu card'
                            width={80}
                            height={120}
                            className='cpu'
                        />
                    ))}
                </div>
                {showUnoCpu && (
                    <div className='cpu-animation'>
                        <Image src='/images/uno!.png' alt='UNO!' width={100} height={50} id='cpu-uno' />
                    </div>
                )}
            </div>

            {/* INFO PANEL - Turn and Last Played Card */}
            <div className='info-panel'>
                <div className='turn-indicator'>
                    <p className='turn-text'>
                        {playerTurn ? (
                            <span className='turn-player'>🎮 YOUR TURN 🎮</span>
                        ) : (
                            <span className='turn-cpu'>🤖 CPU TURN 🤖</span>
                        )}
                    </p>
                </div>
                
                <div className='last-played'>
                    <p>📋 Last Played Card</p>
                    <p className='last-played-card'>
                        {topCard && (
                            <>
                                {topCard.playedByPlayer ? '👤 Player played: ' : '🤖 CPU played: '}
                                {getCardName(topCard)}
                                {topCard.drawValue > 0 && ` (+${topCard.drawValue})`}
                                {topCard.value === 13 && topCard.color !== 'any' && (
                                    <span style={{ 
                                        display: 'inline-block', 
                                        marginLeft: '8px', 
                                        padding: '2px 10px', 
                                        borderRadius: '20px', 
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        backgroundColor: topCard.color === 'rgb(255, 6, 0)' ? '#ff4444' :
                                                       topCard.color === 'rgb(0, 170, 69)' ? '#4caf50' :
                                                       topCard.color === 'rgb(0, 150, 224)' ? '#2196f3' :
                                                       '#ffeb3b',
                                        color: topCard.color === 'rgb(255, 222, 0)' ? '#333' : 'white',
                                        animation: 'fadeIn 0.3s ease'
                                    }}>
                                        {topCard.color === 'rgb(255, 6, 0)' ? '🔴 RED' :
                                         topCard.color === 'rgb(0, 170, 69)' ? '🟢 GREEN' :
                                         topCard.color === 'rgb(0, 150, 224)' ? '🔵 BLUE' :
                                         '🟡 YELLOW'}
                                    </span>
                                )}
                            </>
                        )}
                    </p>
                </div>
            </div>

            {/* PLAY AREA */}
            <div className='play-area'>
                <div className='score'>
                    <p
                        className='cpu-score-title'
                        style={{ color: !playerTurn ? '#ff9800' : '#fff' }}
                    >
                        🤖 CPU SCORE: <span id='cpu-score'>{cpuScore}</span>
                    </p>
                    <div id='seperator' />
                    <p
                        className='player-score-title'
                        style={{ color: playerTurn ? '#4caf50' : '#fff' }}
                    >
                        🎮 PLAYER SCORE: <span id='player-score'>{playerScore}</span>
                    </p>
                    <p className='rules' style={{ color: '#ffd700' }}>
                        ⚡ First to reach {GAME_OVER_SCORE} points loses ⚡
                    </p>
                </div>

                {/* PLAY PILE */}
                <div className='play-pile'>
                    {topCard && (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <Image
                                src={topCard.src}
                                alt='play pile'
                                width={100}
                                height={150}
                                style={{
                                    transition: 'all 0.3s ease',
                                    borderRadius: '10px',
                                    boxShadow: (topCard.color !== 'any' && topCard.value === 13 && topCard.drawValue === 0) ? 
                                        (topCard.color === 'rgb(255, 6, 0)' ? '0 0 0 4px rgba(255, 6, 0, 0.8), 0 0 0 8px rgba(255, 6, 0, 0.4), 0 0 20px 5px rgba(255, 6, 0, 0.6)' :
                                        topCard.color === 'rgb(0, 170, 69)' ? '0 0 0 4px rgba(0, 170, 69, 0.8), 0 0 0 8px rgba(0, 170, 69, 0.4), 0 0 20px 5px rgba(0, 170, 69, 0.6)' :
                                        topCard.color === 'rgb(0, 150, 224)' ? '0 0 0 4px rgba(0, 150, 224, 0.8), 0 0 0 8px rgba(0, 150, 224, 0.4), 0 0 20px 5px rgba(0, 150, 224, 0.6)' :
                                        '0 0 0 4px rgba(255, 222, 0, 0.8), 0 0 0 8px rgba(255, 222, 0, 0.4), 0 0 20px 5px rgba(255, 222, 0, 0.6)') :
                                        '0 0.8rem 1.6rem rgba(0, 0, 0, 0.3)',
                                    transform: (topCard.color !== 'any' && topCard.value === 13 && topCard.drawValue === 0) ? 'scale(1.02)' : 'scale(1)',
                                    border: (topCard.color !== 'any' && topCard.value === 13 && topCard.drawValue === 0) ? '2px solid' : 'none',
                                    borderColor: topCard.color === 'rgb(255, 6, 0)' ? '#ff4444' :
                                               topCard.color === 'rgb(0, 170, 69)' ? '#4caf50' :
                                               topCard.color === 'rgb(0, 150, 224)' ? '#2196f3' :
                                               topCard.color === 'rgb(255, 222, 0)' ? '#ffeb3b' : 'transparent'
                                }}
                            />
                            {(topCard.color !== 'any' && topCard.value === 13 && topCard.drawValue === 0) && (
                                <div style={{
                                    position: 'absolute',
                                    top: '-8px',
                                    left: '-8px',
                                    right: '-8px',
                                    bottom: '-8px',
                                    borderRadius: '15px',
                                    background: `radial-gradient(circle, ${
                                        topCard.color === 'rgb(255, 6, 0)' ? 'rgba(255, 6, 0, 0.3)' :
                                        topCard.color === 'rgb(0, 170, 69)' ? 'rgba(0, 170, 69, 0.3)' :
                                        topCard.color === 'rgb(0, 150, 224)' ? 'rgba(0, 150, 224, 0.3)' :
                                        'rgba(255, 222, 0, 0.3)'
                                    }, transparent)`,
                                    pointerEvents: 'none',
                                    animation: 'glowPulse 1.5s ease-in-out infinite',
                                    zIndex: 1
                                }} />
                            )}
                        </div>
                    )}
                </div>

                {/* DRAW PILE */}
                <div 
                    className='draw-pile' 
                    onClick={handleDrawPileClick} 
                    style={{ 
                        cursor: playerTurn && !colorPickerOpen && gameOn && !isDrawing ? 'pointer' : 'not-allowed',
                        opacity: playerTurn && !colorPickerOpen && gameOn && !isDrawing ? 1 : 0.6
                    }}
                >
                    <Image
                        src='/images/back.png'
                        alt='draw pile'
                        width={100}
                        height={150}
                    />
                    <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '1.2rem' }}>
                        🃟 Draw Card
                    </div>
                </div>
            </div>

            {/* END OF ROUND */}
            {roundVisible && (
                <div className='end-of-round'>
                    <p className='round'>
                        {roundWinner === 'player' ? '🎉 You won the round! 🎉' : '😢 CPU won the round... 😢'}
                    </p>
                </div>
            )}

            {/* END OF GAME */}
            {gameVisible && (
                <div className='end-of-game'>
                    <p className='game'>
                        {gameWinner === 'player' ? '🏆 YOU WON THE GAME! 🏆' : '💀 CPU WON THE GAME... 💀'}
                    </p>
                    <p style={{ fontSize: '1.4rem', marginBottom: '1rem' }}>
                        {gameWinner === 'player' ? 'Congratulations!' : 'Better luck next time!'}
                    </p>
                    <button className='play-again' onClick={handlePlayAgain}>
                        🔄 PLAY AGAIN 🔄
                    </button>
                </div>
            )}

            {/* PLAYER BOX */}
            <div className='player-box'>
                <div className='player-hand'>
                    {playerHand.map((card, i) => (
                        <Image
                            key={i}
                            src={card.src}
                            alt={`card ${i}`}
                            width={80}
                            height={120}
                            className='player'
                            onClick={() => handlePlayerCardClick(i)}
                            style={{ cursor: playerTurn && !colorPickerOpen && gameOn ? 'pointer' : 'not-allowed', opacity: playerTurn && !colorPickerOpen && gameOn ? 1 : 0.6 }}
                        />
                    ))}
                </div>
                {showUnoPlayer && (
                    <div className='player-animation'>
                        <Image src='/images/uno!.png' alt='UNO!' width={100} height={50} id='player-uno' />
                    </div>
                )}
            </div>

            {/* COLOR PICKER */}
            {colorPickerOpen && (
                <div className='color-picker'>
                    <p>🎨 SELECT A COLOR 🎨</p>
                    <div>
                        <button 
                            className='red' 
                            onClick={() => handleColorChosen('rgb(255, 6, 0)', 'red')}
                            onMouseEnter={() => setWildCardColor('rgb(255, 6, 0)')}
                            onMouseLeave={() => setWildCardColor(selectedWildColorRef.current)}
                        >
                            🔴 RED
                        </button>
                        <button 
                            className='green' 
                            onClick={() => handleColorChosen('rgb(0, 170, 69)', 'green')}
                            onMouseEnter={() => setWildCardColor('rgb(0, 170, 69)')}
                            onMouseLeave={() => setWildCardColor(selectedWildColorRef.current)}
                        >
                            🟢 GREEN
                        </button>
                        <button 
                            className='blue' 
                            onClick={() => handleColorChosen('rgb(0, 150, 224)', 'blue')}
                            onMouseEnter={() => setWildCardColor('rgb(0, 150, 224)')}
                            onMouseLeave={() => setWildCardColor(selectedWildColorRef.current)}
                        >
                            🔵 BLUE
                        </button>
                        <button 
                            className='yellow' 
                            onClick={() => handleColorChosen('rgb(255, 222, 0)', 'yellow')}
                            onMouseEnter={() => setWildCardColor('rgb(255, 222, 0)')}
                            onMouseLeave={() => setWildCardColor(selectedWildColorRef.current)}
                        >
                            🟡 YELLOW
                        </button>
                    </div>
                </div>
            )}
        </main>
    )
    // #endregion
}
