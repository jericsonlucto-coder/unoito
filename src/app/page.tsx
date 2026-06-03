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

interface Player {
    id: 'player' | 'cpu1' | 'cpu2' | 'cpu3'
    hand: CardType[]
    score: number
    position: 'bottom' | 'top' | 'left' | 'right'
    name: string
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
const PLAYER_ORDER: Player['id'][] = ['cpu1', 'cpu2', 'cpu3', 'player']

export default function UnoGame() {

    // #region STATE
    const [players, setPlayers] = useState<Player[]>([
        { id: 'player', hand: [], score: 0, position: 'bottom', name: 'YOU' },
        { id: 'cpu1', hand: [], score: 0, position: 'top', name: 'CPU TOP' },
        { id: 'cpu2', hand: [], score: 0, position: 'left', name: 'CPU LEFT' },
        { id: 'cpu3', hand: [], score: 0, position: 'right', name: 'CPU RIGHT' },
    ])
    const [deckState, setDeckState] = useState<CardType[]>([])
    const [playPile, setPlayPile] = useState<CardType[]>([])
    const [currentTurn, setCurrentTurn] = useState<Player['id']>('player')
    const [gameOn, setGameOn] = useState(false)
    const [colorPickerOpen, setColorPickerOpen] = useState(false)
    const [showUno, setShowUno] = useState<{ [key: string]: boolean }>({})
    const [roundVisible, setRoundVisible] = useState(false)
    const [roundWinner, setRoundWinner] = useState<string | null>(null)
    const [gameVisible, setGameVisible] = useState(false)
    const [gameWinner, setGameWinner] = useState<string | null>(null)
    const [wildCardColor, setWildCardColor] = useState<string>('')
    const [selectedWildColor, setSelectedWildColor] = useState<string>('')
    const [cpuVisible, setCpuVisible] = useState<{ [key: string]: boolean }>({
        cpu1: false,
        cpu2: false,
        cpu3: false,
    })
    // #endregion

    // #region REFS
    const gameOnRef = useRef(gameOn)
    const playersRef = useRef(players)
    const deckRef = useRef(deckState)
    const playPileRef = useRef(playPile)
    const currentTurnRef = useRef(currentTurn)
    const colorPickerRef = useRef(colorPickerOpen)
    const selectedWildColorRef = useRef(selectedWildColor)

    useEffect(() => { gameOnRef.current = gameOn }, [gameOn])
    useEffect(() => { playersRef.current = players }, [players])
    useEffect(() => { deckRef.current = deckState }, [deckState])
    useEffect(() => { playPileRef.current = playPile }, [playPile])
    useEffect(() => { currentTurnRef.current = currentTurn }, [currentTurn])
    useEffect(() => { colorPickerRef.current = colorPickerOpen }, [colorPickerOpen])
    useEffect(() => { selectedWildColorRef.current = selectedWildColor }, [selectedWildColor])
    // #endregion

    // #region AUDIO INIT
    useEffect(() => {
        audioManager.init()
    }, [])
    // #endregion

    // #region HELPERS
    const getPlayerById = (id: Player['id']) => players.find(p => p.id === id)!
    
    const getNextTurn = (current: Player['id']): Player['id'] => {
        const currentIndex = PLAYER_ORDER.indexOf(current)
        const nextIndex = (currentIndex + 1) % PLAYER_ORDER.length
        return PLAYER_ORDER[nextIndex]
    }

    const drawCardLogic = useCallback((
        hand: CardType[],
        deck: CardType[],
        pile: CardType[]
    ): { newHand: CardType[], newDeck: CardType[], newPlayPile: CardType[], drawnCard: CardType | null } => {
        let newDeck = [...deck]
        let newPlayPile = [...pile]
        let drawnCard: CardType | null = null
        
        // IMPORTANT: Create a copy of the hand array
        let newHand = [...hand]

        if (newDeck.length > 0) {
            drawnCard = newDeck.shift()!
            newHand.push(drawnCard)
        } else {
            // Reshuffle the play pile (excluding the top card)
            const cardsToShuffle = newPlayPile.slice(0, -1)
            newDeck = shuffleDeck(cardsToShuffle)
            newPlayPile = [newPlayPile[newPlayPile.length - 1]]
            drawnCard = newDeck.shift()!
            newHand.push(drawnCard)
        }

        audioManager.play('drawCard')
        return { newHand, newDeck, newPlayPile, drawnCard }
    }, [])

    const triggerUno = useCallback((playerId: string) => {
        audioManager.play('uno')
        setShowUno(prev => ({ ...prev, [playerId]: true }))
        setTimeout(() => {
            setShowUno(prev => ({ ...prev, [playerId]: false }))
        }, 2000)
    }, [])

    const tallyPoints = useCallback((hand: CardType[]): number => {
        return hand.reduce((sum, card) => sum + card.points, 0)
    }, [])

    const getCpuDelay = useCallback(() => {
        return Math.floor((Math.random() * 500) + 1000)
    }, [])
    // #endregion

    // #region NEW GAME
    const newGame = useCallback(() => {
        setGameOn(true)
        gameOnRef.current = true
        setColorPickerOpen(false)
        colorPickerRef.current = false
        setWildCardColor('')
        setSelectedWildColor('')

        let newDeck = createDeck()
        newDeck = shuffleDeck(newDeck)
        audioManager.play('shuffle')

        const newPlayers: Player[] = players.map(player => ({
            ...player,
            hand: [],
            score: 0
        }))

        // Deal 7 cards to each player
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < newPlayers.length; j++) {
                newPlayers[j].hand.push(newDeck.shift()!)
            }
        }

        // Find first valid start card
        let startCard: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) {
            if (newDeck[i].color !== 'any' && newDeck[i].value <= 9) {
                startCard = newDeck.splice(i, 1)[0]
                break
            }
        }

        const newPlayPile = startCard ? [startCard] : []

        setPlayers(newPlayers)
        setDeckState(newDeck)
        setPlayPile(newPlayPile)
        setCurrentTurn('player')
        currentTurnRef.current = 'player'

        playersRef.current = newPlayers
        deckRef.current = newDeck
        playPileRef.current = newPlayPile
    }, [players])
    // #endregion

    // #region CHECK FOR WINNER
    const checkForWinner = useCallback(() => {
        const currentPlayers = playersRef.current
        const winner = currentPlayers.find(p => p.hand.length === 0)
        
        if (winner) {
            // Add points to winner
            const updatedPlayers = currentPlayers.map(p => {
                if (p.id === winner.id) {
                    const points = currentPlayers.reduce((sum, player) => {
                        if (player.id !== winner.id) {
                            return sum + tallyPoints(player.hand)
                        }
                        return sum
                    }, 0)
                    return { ...p, score: p.score + points }
                }
                return p
            })
            
            setPlayers(updatedPlayers)
            playersRef.current = updatedPlayers
            
            const gameWinner = updatedPlayers.find(p => p.score >= GAME_OVER_SCORE)
            
            if (gameWinner) {
                setGameOn(false)
                gameOnRef.current = false
                setGameWinner(gameWinner.id === 'player' ? 'You' : gameWinner.name)
                setGameVisible(true)
                audioManager.play(gameWinner.id === 'player' ? 'winGame' : 'lose')
            } else {
                setRoundWinner(winner.id === 'player' ? 'You' : winner.name)
                setRoundVisible(true)
                setGameOn(false)
                gameOnRef.current = false
                setTimeout(() => {
                    setRoundVisible(false)
                    newGame()
                }, 3000)
            }
            return true
        }
        return false
    }, [tallyPoints, newGame])
    // #endregion

    // #region CPU LOGIC
    const playCPU = useCallback(async (cpuId: Player['id']) => {
        if (currentTurnRef.current !== cpuId || !gameOnRef.current || colorPickerRef.current) return

        await new Promise(resolve => setTimeout(resolve, getCpuDelay()))

        if (currentTurnRef.current !== cpuId || !gameOnRef.current) return

        const cpu = getPlayerById(cpuId)
        const currentPlayPile = [...playPileRef.current]
        const currentDeck = [...deckRef.current]
        const topCard = currentPlayPile[currentPlayPile.length - 1]

        // Find playable cards
        const playable: CardType[] = []
        const remaining: CardType[] = []

        for (const card of cpu.hand) {
            if (
                card.color === topCard.color ||
                card.value === topCard.value ||
                card.color === 'any' ||
                topCard.color === 'any'
            ) {
                playable.push(card)
            } else {
                remaining.push(card)
            }
        }

        if (playable.length === 0) {
            // Draw a card
            const { newHand, newDeck, newPlayPile, drawnCard } = drawCardLogic(
                remaining, currentDeck, currentPlayPile
            )
            
            const updatedPlayers = playersRef.current.map(p =>
                p.id === cpuId ? { ...p, hand: newHand } : p
            )
            
            setPlayers(updatedPlayers)
            playersRef.current = updatedPlayers
            setDeckState(newDeck)
            deckRef.current = newDeck
            setPlayPile(newPlayPile)
            playPileRef.current = newPlayPile
            
            // Check if drawn card can be played immediately
            if (drawnCard) {
                const newTopCard = newPlayPile[newPlayPile.length - 1]
                const canPlayDrawnCard = 
                    drawnCard.color === newTopCard.color ||
                    drawnCard.value === newTopCard.value ||
                    drawnCard.color === 'any' ||
                    newTopCard.color === 'any'
                
                if (canPlayDrawnCard && gameOnRef.current && currentTurnRef.current === cpuId) {
                    // Recursively play the drawn card
                    setTimeout(() => {
                        if (currentTurnRef.current === cpuId && gameOnRef.current && !colorPickerRef.current) {
                            playCPU(cpuId)
                        }
                    }, getCpuDelay())
                    return
                }
            }
            
            // Cannot play drawn card, move to next player
            setCurrentTurn(getNextTurn(cpuId))
            currentTurnRef.current = getNextTurn(cpuId)
            return
        }

        // Choose a card to play
        let chosenCard: CardType
        let leftoverCards: CardType[]

        if (playable.length === 1) {
            chosenCard = playable[0]
            leftoverCards = remaining
        } else {
            // Simple AI: prefer playing higher value cards
            const highestValue = Math.max(...playable.map(c => c.value))
            const cardIndex = playable.findIndex(c => c.value === highestValue)
            chosenCard = playable[cardIndex]
            leftoverCards = [...remaining, ...playable.filter((_, i) => i !== cardIndex)]
        }

        audioManager.playCardSound()

        const newPlayPile = [...currentPlayPile, { ...chosenCard, playedByPlayer: false }]
        let newCpuHand = [...leftoverCards]

        // Handle wild card color selection
        if (chosenCard.color === 'any' && chosenCard.drawValue === 0) {
            const colors = ['rgb(255, 6, 0)', 'rgb(0, 170, 69)', 'rgb(0, 150, 224)', 'rgb(255, 222, 0)']
            const pickedColor = colors[Math.floor(Math.random() * colors.length)]
            newPlayPile[newPlayPile.length - 1].color = pickedColor
            setWildCardColor(pickedColor)
            setSelectedWildColor(pickedColor)
            selectedWildColorRef.current = pickedColor
        }

        // Apply draw card penalty to next player
        if (chosenCard.drawValue > 0) {
            audioManager.play('plusCard')
            const nextPlayerId = getNextTurn(cpuId)
            let nextPlayer = getPlayerById(nextPlayerId)
            let updatedHand = [...nextPlayer.hand]
            let updatedDeck = [...currentDeck]
            let updatedPlayPile = [...newPlayPile]

            for (let i = 0; i < chosenCard.drawValue; i++) {
                const result = drawCardLogic(updatedHand, updatedDeck, updatedPlayPile)
                updatedHand = result.newHand
                updatedDeck = result.newDeck
                updatedPlayPile = result.newPlayPile
            }

            const updatedPlayers = playersRef.current.map(p => {
                if (p.id === nextPlayerId) return { ...p, hand: updatedHand }
                if (p.id === cpuId) return { ...p, hand: newCpuHand }
                return p
            })

            setPlayers(updatedPlayers)
            playersRef.current = updatedPlayers
            setDeckState(updatedDeck)
            deckRef.current = updatedDeck
            setPlayPile(updatedPlayPile)
            playPileRef.current = updatedPlayPile
        } else {
            const updatedPlayers = playersRef.current.map(p =>
                p.id === cpuId ? { ...p, hand: newCpuHand } : p
            )
            setPlayers(updatedPlayers)
            playersRef.current = updatedPlayers
            setPlayPile(newPlayPile)
            playPileRef.current = newPlayPile
        }

        // Check for UNO
        if (newCpuHand.length === 1) {
            triggerUno(cpuId)
        }

        // Check for winner
        if (newCpuHand.length === 0) {
            checkForWinner()
            return
        }

        // Move to next player
        const nextTurn = chosenCard.changeTurn ? getNextTurn(getNextTurn(cpuId)) : getNextTurn(cpuId)
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn
    }, [drawCardLogic, triggerUno, checkForWinner, getCpuDelay])

    // #endregion

    // #region PLAYER ACTIONS
    const handlePlayerCardClick = useCallback((index: number) => {
        if (currentTurnRef.current !== 'player' || colorPickerRef.current || !gameOnRef.current) return

        const player = getPlayerById('player')
        const currentPlayPile = [...playPileRef.current]
        const topCard = currentPlayPile[currentPlayPile.length - 1]
        const card = player.hand[index]

        const isPlayable =
            card.value === topCard.value ||
            card.color === topCard.color ||
            card.color === 'any' ||
            topCard.color === 'any'

        if (!isPlayable) return

        audioManager.playCardSound()

        const newPlayerHand = player.hand.filter((_, i) => i !== index)
        const playedCard = { ...card, playedByPlayer: true }
        const newPlayPile = [...currentPlayPile, playedCard]

        const updatedPlayers = playersRef.current.map(p =>
            p.id === 'player' ? { ...p, hand: newPlayerHand } : p
        )

        setPlayers(updatedPlayers)
        playersRef.current = updatedPlayers
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile

        // Reset wild card color
        if (playedCard.color !== 'any') {
            setWildCardColor('')
            setSelectedWildColor('')
            selectedWildColorRef.current = ''
        }

        // Check for UNO
        if (newPlayerHand.length === 1) {
            triggerUno('player')
        }

        // Apply draw card penalty to next player
        if (playedCard.drawValue > 0) {
            audioManager.play('plusCard')
            const nextPlayerId = getNextTurn('player')
            let nextPlayer = getPlayerById(nextPlayerId)
            let updatedHand = [...nextPlayer.hand]
            let updatedDeck = [...deckRef.current]
            let updatedPlayPile = [...newPlayPile]

            for (let i = 0; i < playedCard.drawValue; i++) {
                const result = drawCardLogic(updatedHand, updatedDeck, updatedPlayPile)
                updatedHand = result.newHand
                updatedDeck = result.newDeck
                updatedPlayPile = result.newPlayPile
            }

            const finalUpdatedPlayers = playersRef.current.map(p => {
                if (p.id === nextPlayerId) return { ...p, hand: updatedHand }
                return p
            })

            setPlayers(finalUpdatedPlayers)
            playersRef.current = finalUpdatedPlayers
            setDeckState(updatedDeck)
            deckRef.current = updatedDeck
            setPlayPile(updatedPlayPile)
            playPileRef.current = updatedPlayPile
        }

        // Check for winner
        if (newPlayerHand.length === 0) {
            checkForWinner()
            return
        }

        // Handle wild card
        if (playedCard.color === 'any' && playedCard.drawValue === 0) {
            setColorPickerOpen(true)
            colorPickerRef.current = true
            return
        }

        // Move to next player
        const nextTurn = playedCard.changeTurn ? getNextTurn(getNextTurn('player')) : getNextTurn('player')
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn
    }, [drawCardLogic, triggerUno, checkForWinner])

    const handleDrawPileClick = useCallback(() => {
        if (currentTurnRef.current !== 'player' || colorPickerRef.current || !gameOnRef.current) return

        const player = getPlayerById('player')
        const { newHand, newDeck, newPlayPile, drawnCard } = drawCardLogic(
            player.hand,
            deckRef.current,
            playPileRef.current
        )

        const updatedPlayers = playersRef.current.map(p =>
            p.id === 'player' ? { ...p, hand: newHand } : p
        )

        setPlayers(updatedPlayers)
        playersRef.current = updatedPlayers
        setDeckState(newDeck)
        deckRef.current = newDeck
        setPlayPile(newPlayPile)
        playPileRef.current = newPlayPile

        // Check if drawn card can be played immediately
        if (drawnCard) {
            const topCard = newPlayPile[newPlayPile.length - 1]
            const canPlayDrawnCard = 
                drawnCard.color === topCard.color ||
                drawnCard.value === topCard.value ||
                drawnCard.color === 'any' ||
                topCard.color === 'any'

            if (canPlayDrawnCard) {
                // Player can play the drawn card - turn stays with player
                // Don't change turn, player can now click the card
                return
            }
        }
        
        // Cannot play drawn card, move to next player
        const nextTurn = getNextTurn('player')
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn
    }, [drawCardLogic])

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
        selectedWildColorRef.current = color

        const nextTurn = getNextTurn('player')
        setCurrentTurn(nextTurn)
        currentTurnRef.current = nextTurn
    }, [])
    // #endregion

    // #region PLAY AGAIN
    const handlePlayAgain = useCallback(() => {
        audioManager.play('playAgain')
        setGameVisible(false)
        newGame()
    }, [newGame])
    // #endregion

    // #region AUTO CPU TURN
    useEffect(() => {
        if (gameOn && currentTurn !== 'player' && !colorPickerOpen) {
            playCPU(currentTurn)
        }
    }, [currentTurn, gameOn, colorPickerOpen, playCPU])
    // #endregion

    // start game on mount
    useEffect(() => {
        newGame()
    }, [])

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

    // Helper to get position class
    const getPositionClass = (position: string) => {
        switch(position) {
            case 'top': return 'cpu-top'
            case 'left': return 'cpu-left'
            case 'right': return 'cpu-right'
            default: return ''
        }
    }

    // #region JSX
    return (
        <main className="game-container">
            {/* CPU TOP */}
            <div className={`cpu-player ${getPositionClass('top')}`}>
                <div className="cpu-info">
                    <div className="cpu-name">{getPlayerById('cpu1').name}</div>
                    <div className="cpu-score">Score: {getPlayerById('cpu1').score}</div>
                </div>
                <div className='cpu-hand'>
                    {getPlayerById('cpu1').hand.map((card, i) => (
                        <Image
                            key={i}
                            src={cpuVisible.cpu1 ? card.src : '/images/back.png'}
                            alt='cpu card'
                            width={60}
                            height={90}
                            className='cpu-card'
                        />
                    ))}
                </div>
                {showUno.cpu1 && (
                    <div className='cpu-animation-top'>
                        <Image src='/images/uno!.png' alt='UNO!' width={80} height={40} />
                    </div>
                )}
            </div>

            {/* CPU LEFT */}
            <div className={`cpu-player ${getPositionClass('left')}`}>
                <div className="cpu-info">
                    <div className="cpu-name">{getPlayerById('cpu2').name}</div>
                    <div className="cpu-score">Score: {getPlayerById('cpu2').score}</div>
                </div>
                <div className='cpu-hand-vertical'>
                    {getPlayerById('cpu2').hand.map((card, i) => (
                        <Image
                            key={i}
                            src={cpuVisible.cpu2 ? card.src : '/images/back.png'}
                            alt='cpu card'
                            width={90}
                            height={60}
                            className='cpu-card-vertical'
                        />
                    ))}
                </div>
                {showUno.cpu2 && (
                    <div className='cpu-animation-left'>
                        <Image src='/images/uno!.png' alt='UNO!' width={80} height={40} />
                    </div>
                )}
            </div>

            {/* CPU RIGHT */}
            <div className={`cpu-player ${getPositionClass('right')}`}>
                <div className="cpu-info">
                    <div className="cpu-name">{getPlayerById('cpu3').name}</div>
                    <div className="cpu-score">Score: {getPlayerById('cpu3').score}</div>
                </div>
                <div className='cpu-hand-vertical'>
                    {getPlayerById('cpu3').hand.map((card, i) => (
                        <Image
                            key={i}
                            src={cpuVisible.cpu3 ? card.src : '/images/back.png'}
                            alt='cpu card'
                            width={90}
                            height={60}
                            className='cpu-card-vertical'
                        />
                    ))}
                </div>
                {showUno.cpu3 && (
                    <div className='cpu-animation-right'>
                        <Image src='/images/uno!.png' alt='UNO!' width={80} height={40} />
                    </div>
                )}
            </div>

            {/* CENTER PLAY AREA */}
            <div className='center-area'>
                {/* Turn Indicator */}
                <div className='turn-indicator'>
                    <p className='turn-text'>
                        {currentTurn === 'player' ? (
                            <span className='turn-player'>🎮 YOUR TURN 🎮</span>
                        ) : (
                            <span className='turn-cpu'>🤖 {getPlayerById(currentTurn).name}'s TURN 🤖</span>
                        )}
                    </p>
                </div>

                {/* Last Played Card Info */}
                <div className='last-played'>
                    <p>📋 Last Played Card</p>
                    <p className='last-played-card'>
                        {topCard && (
                            <>
                                {topCard.playedByPlayer ? '👤 Player played: ' : '🤖 CPU played: '}
                                {getCardName(topCard)}
                                {topCard.drawValue > 0 && ` (+${topCard.drawValue})`}
                            </>
                        )}
                    </p>
                </div>

                {/* Play Area Cards */}
                <div className='table-cards'>
                    <div className='play-pile'>
                        {topCard && (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                <Image
                                    src={topCard.src}
                                    alt='play pile'
                                    width={120}
                                    height={180}
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
                                    }}
                                />
                            </div>
                        )}
                    </div>

                    <div className='draw-pile' onClick={handleDrawPileClick} style={{
                        cursor: currentTurn === 'player' && !colorPickerOpen && gameOn ? 'pointer' : 'not-allowed',
                        opacity: currentTurn === 'player' && !colorPickerOpen && gameOn ? 1 : 0.6
                    }}>
                        <Image
                            src='/images/back.png'
                            alt='draw pile'
                            width={120}
                            height={180}
                        />
                        <div className='draw-text'>Draw Card</div>
                    </div>
                </div>

                {/* Scores */}
                <div className='scores'>
                    {players.map(player => (
                        <div key={player.id} className={`score-card ${player.id === currentTurn ? 'active-turn' : ''}`}>
                            <span className='score-name'>{player.name}</span>
                            <span className='score-value'>{player.score}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* PLAYER BOTTOM */}
            <div className='player-bottom'>
                <div className="player-info">
                    <div className="player-name">YOU</div>
                    <div className="player-score">Score: {getPlayerById('player').score}</div>
                </div>
                <div className='player-hand'>
                    {getPlayerById('player').hand.map((card, i) => (
                        <Image
                            key={i}
                            src={card.src}
                            alt={`card ${i}`}
                            width={80}
                            height={120}
                            className='player-card'
                            onClick={() => handlePlayerCardClick(i)}
                            style={{
                                cursor: currentTurn === 'player' && !colorPickerOpen && gameOn ? 'pointer' : 'not-allowed',
                                opacity: currentTurn === 'player' && !colorPickerOpen && gameOn ? 1 : 0.6
                            }}
                        />
                    ))}
                </div>
                {showUno.player && (
                    <div className='player-animation'>
                        <Image src='/images/uno!.png' alt='UNO!' width={100} height={50} />
                    </div>
                )}
            </div>

            {/* COLOR PICKER */}
            {colorPickerOpen && (
                <div className='color-picker'>
                    <p>🎨 SELECT A COLOR 🎨</p>
                    <div>
                        <button className='red' onClick={() => handleColorChosen('rgb(255, 6, 0)', 'red')}>
                            🔴 RED
                        </button>
                        <button className='green' onClick={() => handleColorChosen('rgb(0, 170, 69)', 'green')}>
                            🟢 GREEN
                        </button>
                        <button className='blue' onClick={() => handleColorChosen('rgb(0, 150, 224)', 'blue')}>
                            🔵 BLUE
                        </button>
                        <button className='yellow' onClick={() => handleColorChosen('rgb(255, 222, 0)', 'yellow')}>
                            🟡 YELLOW
                        </button>
                    </div>
                </div>
            )}

            {/* END OF ROUND MODAL */}
            {roundVisible && (
                <div className='end-of-round'>
                    <p>{roundWinner} won the round!</p>
                </div>
            )}

            {/* END OF GAME MODAL */}
            {gameVisible && (
                <div className='end-of-game'>
                    <p>{gameWinner} won the game!</p>
                    <button onClick={handlePlayAgain}>Play Again</button>
                </div>
            )}
        </main>
    )
    // #endregion
}
