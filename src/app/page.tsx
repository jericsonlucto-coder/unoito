'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import Pusher from 'pusher-js'

// #region PUSHER CONFIG
const PUSHER_CONFIG = {
    key: "4de6e91a5e72dd9096db",
    cluster: "ap1"
}

// #endregion

// #region TYPES
interface CardType {
    color: string
    value: number
    points: number
    changeTurn: boolean
    drawValue: number
    src: string
    playedByPlayer: boolean
    playerId?: string
}

interface Player {
    id: string
    name: string
    hand: CardType[]
    score: number
    position: 'bottom' | 'top' | 'left' | 'right'
    isReady: boolean
    isOnline: boolean
}

interface GameState {
    gameId: string
    players: Player[]
    currentTurn: string
    deck: CardType[]
    playPile: CardType[]
    direction: 'clockwise' | 'counter-clockwise'
    gameStarted: boolean
    winner: string | null
}

interface GameEvent {
    type: 'PLAY_CARD' | 'DRAW_CARD' | 'COLOR_CHOSEN' | 'UNO' | 'PLAYER_READY' | 'PLAYER_JOINED' | 'PLAYER_LEFT' | 'START_GAME' | 'SYNC_STATE'
    playerId: string
    playerName?: string
    data: any
}

interface RoomData {
    players: Player[]
    gameState: GameState | null
    createdAt: number
    hostId: string
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
    playerId?: string

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
        } else if (i === 10) {
            deck.push(new Card(rgb, i, 20, false, 0, `/images/${color}${i}.png`))
            deck.push(new Card(rgb, i, 20, false, 0, `/images/${color}${i}.png`))
        } else if (i === 11) {
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

// Helper functions for room storage
const saveRoomsToLocalStorage = (rooms: Map<string, RoomData>) => {
    if (typeof window !== 'undefined') {
        const roomsObj: Record<string, RoomData> = {}
        rooms.forEach((value, key) => {
            roomsObj[key] = value
        })
        localStorage.setItem('uno_rooms', JSON.stringify(roomsObj))
        console.log('💾 Rooms saved to localStorage:', Array.from(rooms.keys()))
    }
}

const loadRoomsFromLocalStorage = (): Map<string, RoomData> => {
    const rooms = new Map<string, RoomData>()
    if (typeof window !== 'undefined') {
        const saved = localStorage.getItem('uno_rooms')
        if (saved) {
            try {
                const roomsObj = JSON.parse(saved) as Record<string, RoomData>
                Object.entries(roomsObj).forEach(([key, value]) => {
                    rooms.set(key, value)
                })
                console.log('📂 Rooms loaded from localStorage:', Array.from(rooms.keys()))
            } catch (e) {
                console.error('Failed to load rooms from localStorage:', e)
            }
        } else {
            console.log('📂 No rooms found in localStorage')
        }
    }
    return rooms
}

export default function UnoGame() {

    // #region STATE
    const [gameMode, setGameMode] = useState<'menu' | 'waiting' | 'playing'>('menu')
    const [selectedMode, setSelectedMode] = useState<'ai' | 'multiplayer'>('ai')
    const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2)
    const [roomId, setRoomId] = useState<string>('')
    const [playerId, setPlayerId] = useState<string>('')
    const [playerName, setPlayerName] = useState<string>('')
    const [players, setPlayers] = useState<Player[]>([])
    const [gameState, setGameState] = useState<GameState | null>(null)
    const [currentTurn, setCurrentTurn] = useState<string>('')
    const [direction, setDirection] = useState<'clockwise' | 'counter-clockwise'>('clockwise')
    const [showUno, setShowUno] = useState<{ [key: string]: boolean }>({})
    const [colorPickerOpen, setColorPickerOpen] = useState(false)
    const [selectedWildColor, setSelectedWildColor] = useState<string>('')
    const [messages, setMessages] = useState<string[]>([])
    const [pusherChannel, setPusherChannel] = useState<any>(null)
    const [pusherConnection, setPusherConnection] = useState<any>(null)
    const [isHost, setIsHost] = useState(false)
    // #endregion

    // #region REFS
    const gameStateRef = useRef(gameState)
    const playersRef = useRef(players)
    const currentTurnRef = useRef(currentTurn)
    const directionRef = useRef(direction)

    useEffect(() => { gameStateRef.current = gameState }, [gameState])
    useEffect(() => { playersRef.current = players }, [players])
    useEffect(() => { currentTurnRef.current = currentTurn }, [currentTurn])
    useEffect(() => { directionRef.current = direction }, [direction])
    // #endregion

    // #region AUDIO INIT
    useEffect(() => {
        audioManager.init()
    }, [])
    // #endregion

    // #region HELPER FUNCTIONS
    const generateRoomId = () => {
        return Math.random().toString(36).substring(2, 8).toUpperCase()
    }

    const generatePlayerId = () => {
        return `player_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    }

    const addMessage = (msg: string) => {
        console.log('💬 Message:', msg)
        setMessages(prev => [...prev, `${new Date().toLocaleTimeString()} - ${msg}`])
    }

    const copyInviteLink = () => {
        const link = `${window.location.origin}?room=${roomId}`
        navigator.clipboard.writeText(link)
        addMessage('Invite link copied to clipboard!')
    }

    const getNextTurn = (current: string, currentDirection: 'clockwise' | 'counter-clockwise', playerList: Player[]): string => {
        const playerIds = playerList.map(p => p.id)
        const currentIndex = playerIds.indexOf(current)
        let nextIndex: number
        
        if (currentDirection === 'clockwise') {
            nextIndex = (currentIndex + 1) % playerIds.length
        } else {
            nextIndex = (currentIndex - 1 + playerIds.length) % playerIds.length
        }
        
        return playerIds[nextIndex]
    }

    const triggerUno = (playerId: string) => {
        audioManager.play('uno')
        setShowUno(prev => ({ ...prev, [playerId]: true }))
        setTimeout(() => {
            setShowUno(prev => ({ ...prev, [playerId]: false }))
        }, 2000)
    }

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
            10: 'Reverse',
            11: 'Skip',
            12: 'Draw 2',
            13: 'Wild Card',
            14: 'Wild Draw 4'
        }
        const value = valueNames[card.value] || card.value.toString()
        return `${colorNames[card.color] || card.color} ${value}`
    }
    // #endregion

    // #region AI PLAYER LOGIC
    const createAIPlayer = (id: string, name: string, position: 'top' | 'left' | 'right'): Player => ({
        id,
        name,
        hand: [],
        score: 0,
        position,
        isReady: true,
        isOnline: true
    })

    const startAIGame = async () => {
        const newGameId = generateRoomId()
        const newPlayerId = generatePlayerId()
        const newPlayerName = playerName || `Player_${newPlayerId.slice(-4)}`
        
        setPlayerId(newPlayerId)
        setRoomId(newGameId)
        
        let newDeck = createDeck()
        newDeck = shuffleDeck(newDeck)
        
        const playersList: Player[] = [
            {
                id: newPlayerId,
                name: newPlayerName,
                hand: [],
                score: 0,
                position: 'bottom',
                isReady: true,
                isOnline: true
            }
        ]
        
        // Add AI players based on selected count
        const aiPositions = ['top', 'left', 'right'] as const
        for (let i = 0; i < playerCount - 1; i++) {
            playersList.push(createAIPlayer(
                `ai_${i}`,
                `CPU ${aiPositions[i].toUpperCase()}`,
                aiPositions[i]
            ))
        }
        
        // Deal 7 cards to each player
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < playersList.length; j++) {
                const card = newDeck.shift()
                if (card) playersList[j].hand.push(card)
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
        
        const newGameState: GameState = {
            gameId: newGameId,
            players: playersList,
            currentTurn: newPlayerId,
            deck: newDeck,
            playPile: startCard ? [startCard] : [],
            direction: 'clockwise',
            gameStarted: true,
            winner: null
        }
        
        setGameState(newGameState)
        setPlayers(playersList)
        setCurrentTurn(newPlayerId)
        setGameMode('playing')
        addMessage('Game started! Good luck!')
    }

    const playAITurn = useCallback(async () => {
        if (!gameStateRef.current || currentTurnRef.current === playerId) return

        await new Promise(resolve => setTimeout(resolve, 1500))

        const aiPlayer = gameStateRef.current.players.find(p => p.id === currentTurnRef.current)
        if (!aiPlayer || aiPlayer.id === playerId) return

        const topCard = gameStateRef.current.playPile[gameStateRef.current.playPile.length - 1]
        
        // Find playable cards
        const playable = aiPlayer.hand.filter(card =>
            card.color === topCard.color ||
            card.value === topCard.value ||
            card.color === 'any' ||
            topCard.color === 'any'
        )

        if (playable.length === 0) {
            // Draw a card
            const newDeck = [...gameStateRef.current.deck]
            const drawnCard = newDeck.shift()
            if (!drawnCard) return
            
            const newHand = [...aiPlayer.hand, drawnCard]
            
            const updatedPlayers = gameStateRef.current.players.map(p =>
                p.id === aiPlayer.id ? { ...p, hand: newHand } : p
            )
            
            setGameState({
                ...gameStateRef.current,
                players: updatedPlayers,
                deck: newDeck,
            })
            
            addMessage(`${aiPlayer.name} drew a card`)
            
            const nextTurn = getNextTurn(aiPlayer.id, directionRef.current, updatedPlayers)
            setCurrentTurn(nextTurn)
            return
        }

        // Play a card
        const playedCard = playable[0]
        const newHand = aiPlayer.hand.filter(c => c !== playedCard)
        const newPlayPile = [...gameStateRef.current.playPile, { ...playedCard, playedByPlayer: false, playerId: aiPlayer.id }]
        
        audioManager.playCardSound()
        
        let newDirection = directionRef.current
        if (playedCard.value === 10) {
            newDirection = directionRef.current === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(newDirection)
        }
        
        const updatedPlayers = gameStateRef.current.players.map(p =>
            p.id === aiPlayer.id ? { ...p, hand: newHand } : p
        )
        
        let nextTurn = getNextTurn(aiPlayer.id, newDirection, updatedPlayers)
        
        if (playedCard.value === 11) {
            nextTurn = getNextTurn(nextTurn, newDirection, updatedPlayers)
        }
        
        if (playedCard.drawValue > 0) {
            const nextPlayer = updatedPlayers.find(p => p.id === nextTurn)
            if (nextPlayer) {
                const newDeck = [...gameStateRef.current.deck]
                for (let i = 0; i < playedCard.drawValue; i++) {
                    const card = newDeck.shift()
                    if (card) nextPlayer.hand.push(card)
                }
                addMessage(`${aiPlayer.name} played ${getCardName(playedCard)} and ${nextPlayer.name} drew ${playedCard.drawValue} cards`)
                setGameState({
                    ...gameStateRef.current,
                    players: updatedPlayers,
                    playPile: newPlayPile,
                    deck: newDeck
                })
            }
        } else {
            addMessage(`${aiPlayer.name} played ${getCardName(playedCard)}`)
            setGameState({
                ...gameStateRef.current,
                players: updatedPlayers,
                playPile: newPlayPile,
                deck: gameStateRef.current.deck
            })
        }
        
        if (newHand.length === 1) {
            triggerUno(aiPlayer.id)
            addMessage(`${aiPlayer.name} said UNO!`)
        }
        
        if (newHand.length === 0) {
            addMessage(`${aiPlayer.name} won the round!`)
        }
        
        setDirection(newDirection)
        setCurrentTurn(nextTurn)
    }, [playerId])

    useEffect(() => {
        if (gameMode === 'playing' && gameState && gameState.gameStarted && currentTurn !== playerId) {
            const isAITurn = gameState.players.find(p => p.id === currentTurn)?.id !== playerId
            if (isAITurn) {
                playAITurn()
            }
        }
    }, [currentTurn, gameMode, gameState, playAITurn, playerId])
    // #endregion

    // #region MULTIPLAYER FUNCTIONS
    const createMultiplayerRoom = () => {
        console.log('🏠 Creating multiplayer room...')
        const newRoomId = generateRoomId()
        const newPlayerId = generatePlayerId()
        const newPlayerName = playerName.trim() || `Player_${newPlayerId.slice(-4)}`
        
        console.log('📝 Room details:', { roomId: newRoomId, playerId: newPlayerId, playerName: newPlayerName })
        
        setPlayerId(newPlayerId)
        setRoomId(newRoomId)
        setIsHost(true)
        
        // Store room in global map
        const newPlayer: Player = {
            id: newPlayerId,
            name: newPlayerName,
            hand: [],
            score: 0,
            position: 'bottom',
            isReady: true,
            isOnline: true
        }
        
        const rooms = loadRoomsFromLocalStorage()
        rooms.set(newRoomId, {
            players: [newPlayer],
            gameState: null,
            createdAt: Date.now(),
            hostId: newPlayerId
        })
        saveRoomsToLocalStorage(rooms)
        
        // Initialize Pusher for real-time updates
        console.log('🔌 Initializing Pusher connection for host...')
        const pusher = new Pusher(PUSHER_CONFIG.key, {
            cluster: PUSHER_CONFIG.cluster,
            enableStats: true
        })
        
        setPusherConnection(pusher)
        
        pusher.connection.bind('state_change', (states: any) => {
            console.log('📡 Pusher connection state:', states.current)
        })
        
        pusher.connection.bind('connected', () => {
            console.log('✅ Pusher connected successfully!')
            addMessage('Connected to game server!')
        })
        
        pusher.connection.bind('error', (err: any) => {
            console.error('❌ Pusher connection error:', err)
            addMessage('Failed to connect to game server!')
        })
        
        const channel = pusher.subscribe(`game-${newRoomId}`)
        setPusherChannel(channel)
        
        channel.bind('pusher:subscription_succeeded', () => {
            console.log(`✅ Subscribed to channel: game-${newRoomId}`)
            addMessage(`Room ${newRoomId} created! Waiting for players...`)
        })
        
        channel.bind('pusher:subscription_error', (error: any) => {
            console.error('❌ Subscription error:', error)
            addMessage('Failed to subscribe to room channel!')
        })
        
        channel.bind('client-game-event', (data: GameEvent) => {
            console.log('📨 Host received game event:', data)
            handleGameEvent(data)
        })
        
        setPlayers([newPlayer])
        setGameMode('waiting')
        addMessage(`Room created! Room code: ${newRoomId}`)
        addMessage(`Share this code with friends to join!`)
    }

    const joinMultiplayerRoom = () => {
        const inputRoomId = roomId.trim().toUpperCase()
        
        console.log('🔍 Attempting to join room:', inputRoomId)
        
        if (!inputRoomId) {
            console.log('❌ No room code entered')
            addMessage('Please enter a room code!')
            return
        }
        
        const rooms = loadRoomsFromLocalStorage()
        console.log('📂 Available rooms:', Array.from(rooms.keys()))
        
        const room = rooms.get(inputRoomId)
        
        if (!room) {
            console.log(`❌ Room "${inputRoomId}" not found in localStorage`)
            addMessage(`Room "${inputRoomId}" not found! Please check the room code.`)
            return
        }
        
        console.log('✅ Room found:', { roomId: inputRoomId, players: room.players.length, hostId: room.hostId })
        
        if (room.players.length >= 4) {
            console.log('❌ Room is full')
            addMessage('Room is full!')
            return
        }
        
        const newPlayerId = generatePlayerId()
        const newPlayerName = playerName.trim() || `Player_${newPlayerId.slice(-4)}`
        
        console.log('👤 New player joining:', { playerId: newPlayerId, playerName: newPlayerName })
        
        setPlayerId(newPlayerId)
        setIsHost(false)
        
        // Add player to room
        const positions = ['right', 'top', 'left'] as const
        const position = positions[room.players.length - 1] || 'right'
        
        const newPlayer: Player = {
            id: newPlayerId,
            name: newPlayerName,
            hand: [],
            score: 0,
            position: position,
            isReady: true,
            isOnline: true
        }
        
        room.players.push(newPlayer)
        rooms.set(inputRoomId, room)
        saveRoomsToLocalStorage(rooms)
        
        console.log('✅ Player added to room. Total players:', room.players.length)
        
        // Initialize Pusher
        console.log('🔌 Initializing Pusher connection for joiner...')
        const pusher = new Pusher(PUSHER_CONFIG.key, {
            cluster: PUSHER_CONFIG.cluster,
            enableStats: true
        })
        
        setPusherConnection(pusher)
        
        pusher.connection.bind('state_change', (states: any) => {
            console.log('📡 Joiner Pusher connection state:', states.current)
        })
        
        pusher.connection.bind('connected', () => {
            console.log('✅ Joiner Pusher connected successfully!')
            addMessage('Connected to game server!')
            
            // Notify host about new player after connection is established
            setTimeout(() => {
                console.log('📤 Sending PLAYER_JOINED event to host...')
                channel.trigger('client-game-event', {
                    type: 'PLAYER_JOINED',
                    playerId: newPlayerId,
                    playerName: newPlayerName,
                    data: { players: room.players }
                })
                console.log('✅ PLAYER_JOINED event sent')
            }, 1000)
        })
        
        pusher.connection.bind('error', (err: any) => {
            console.error('❌ Joiner Pusher connection error:', err)
            addMessage('Failed to connect to game server!')
        })
        
        const channel = pusher.subscribe(`game-${inputRoomId}`)
        setPusherChannel(channel)
        
        channel.bind('pusher:subscription_succeeded', () => {
            console.log(`✅ Joiner subscribed to channel: game-${inputRoomId}`)
            addMessage(`Connected to room ${inputRoomId}! Waiting for host to start...`)
        })
        
        channel.bind('pusher:subscription_error', (error: any) => {
            console.error('❌ Joiner subscription error:', error)
            addMessage('Failed to subscribe to room channel!')
        })
        
        channel.bind('client-game-event', (data: GameEvent) => {
            console.log('📨 Joiner received game event:', data)
            handleGameEvent(data)
        })
        
        setPlayers(room.players)
        setRoomId(inputRoomId)
        setGameMode('waiting')
        addMessage(`Joined room: ${inputRoomId}`)
        addMessage(`Players in room: ${room.players.length}/4`)
    }

    const handleGameEvent = (event: GameEvent) => {
        console.log('🎮 Game event handler triggered:', event.type, event)
        
        switch(event.type) {
            case 'PLAYER_JOINED':
                console.log(`👋 Player joined: ${event.playerName}`)
                addMessage(`${event.playerName} joined the game`)
                if (event.data?.players) {
                    const playersList: Player[] = event.data.players
                    console.log('📋 Updated players list:', playersList.map((p: Player) => p.name))
                    setPlayers(playersList)
                    // Update room in localStorage
                    const rooms = loadRoomsFromLocalStorage()
                    const room = rooms.get(roomId)
                    if (room) {
                        room.players = playersList
                        rooms.set(roomId, room)
                        saveRoomsToLocalStorage(rooms)
                        console.log('💾 Updated room in localStorage')
                    }
                }
                break
            case 'PLAYER_LEFT':
                console.log(`👋 Player left: ${event.playerName}`)
                addMessage(`${event.playerName} left the game`)
                break
            case 'START_GAME':
                console.log('🎮 START_GAME event received!')
                if (event.data?.gameState) {
                    console.log('📋 Game state received:', event.data.gameState)
                    setGameState(event.data.gameState)
                    setCurrentTurn(event.data.gameState.currentTurn)
                    setDirection(event.data.gameState.direction)
                    setGameMode('playing')
                    addMessage('Game started! Good luck!')
                }
                break
            case 'SYNC_STATE':
                console.log('🔄 SYNC_STATE event received')
                if (event.data?.gameState) {
                    console.log('📋 Syncing game state...')
                    setGameState(event.data.gameState)
                    setCurrentTurn(event.data.gameState.currentTurn)
                    setDirection(event.data.gameState.direction)
                }
                break
            default:
                console.log('❓ Unknown event type:', event.type)
                break
        }
    }

    const startMultiplayerGame = () => {
        console.log('🚀 Host attempting to start game...')
        
        const rooms = loadRoomsFromLocalStorage()
        const room = rooms.get(roomId)
        
        if (!room) {
            console.log('❌ Room not found!')
            addMessage('Room not found!')
            return
        }
        
        console.log('📊 Room data:', { playerCount: room.players.length, hostId: room.hostId, currentHost: isHost })
        
        if (room.players.length < 2) {
            console.log('❌ Not enough players:', room.players.length)
            addMessage('Need at least 2 players to start!')
            return
        }
        
        // Initialize game
        console.log('🎲 Initializing game...')
        let newDeck = createDeck()
        newDeck = shuffleDeck(newDeck)
        
        // Deal cards
        const playersWithHands: Player[] = room.players.map(player => ({
            ...player,
            hand: [] as CardType[]
        }))
        
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < playersWithHands.length; j++) {
                const card = newDeck.shift()
                if (card) {
                    playersWithHands[j].hand.push(card)
                }
            }
        }
        
        // Find start card
        let startCard: CardType | null = null
        for (let i = 0; i < newDeck.length; i++) {
            if (newDeck[i].color !== 'any' && newDeck[i].value <= 9) {
                startCard = newDeck.splice(i, 1)[0]
                break
            }
        }
        
        const newGameState: GameState = {
            gameId: roomId,
            players: playersWithHands,
            currentTurn: playersWithHands[0].id,
            deck: newDeck,
            playPile: startCard ? [startCard] : [],
            direction: 'clockwise',
            gameStarted: true,
            winner: null
        }
        
        console.log('✅ Game state created:', { 
            players: newGameState.players.map(p => p.name),
            currentTurn: newGameState.currentTurn,
            deckSize: newGameState.deck.length
        })
        
        room.gameState = newGameState
        rooms.set(roomId, room)
        saveRoomsToLocalStorage(rooms)
        
        // Notify all players
        if (pusherChannel) {
            console.log('📤 Sending START_GAME event to all players...')
            pusherChannel.trigger('client-game-event', {
                type: 'START_GAME',
                playerId: 'system',
                data: { gameState: newGameState }
            })
            console.log('✅ START_GAME event sent')
        } else {
            console.error('❌ No Pusher channel available!')
        }
        
        setGameState(newGameState)
        setCurrentTurn(newGameState.currentTurn)
        setDirection(newGameState.direction)
        setGameMode('playing')
        addMessage('Game started! Good luck!')
    }

    const leaveRoom = () => {
        console.log('🚪 Leaving room...')
        if (roomId && pusherChannel) {
            const player = players.find(p => p.id === playerId)
            console.log('📤 Sending PLAYER_LEFT event...')
            pusherChannel.trigger('client-game-event', {
                type: 'PLAYER_LEFT',
                playerId: playerId,
                playerName: player?.name,
                data: {}
            })
            pusherChannel.unsubscribe()
            
            if (pusherConnection) {
                pusherConnection.disconnect()
            }
            
            // Remove player from room
            const rooms = loadRoomsFromLocalStorage()
            const room = rooms.get(roomId)
            if (room) {
                room.players = room.players.filter(p => p.id !== playerId)
                if (room.players.length === 0) {
                    rooms.delete(roomId)
                    console.log('🗑️ Room deleted (empty)')
                } else {
                    rooms.set(roomId, room)
                    console.log('👥 Player removed from room. Remaining players:', room.players.length)
                }
                saveRoomsToLocalStorage(rooms)
            }
        }
        setGameMode('menu')
        setRoomId('')
        setPlayers([])
        setMessages([])
        setIsHost(false)
        setPusherChannel(null)
        setPusherConnection(null)
        console.log('✅ Left room successfully')
    }
    // #endregion

    // #region GAME ACTIONS
    const handlePlayCard = (cardIndex: number) => {
        if (!gameState || currentTurn !== playerId || colorPickerOpen) return
        
        const player = gameState.players.find(p => p.id === playerId)
        if (!player) return
        
        const card = player.hand[cardIndex]
        const topCard = gameState.playPile[gameState.playPile.length - 1]
        
        const isPlayable = card.value === topCard.value ||
                          card.color === topCard.color ||
                          card.color === 'any' ||
                          topCard.color === 'any'
        
        if (!isPlayable) return
        
        // Play the card
        const newHand = player.hand.filter((_, i) => i !== cardIndex)
        const playedCard = { ...card, playedByPlayer: true, playerId }
        const newPlayPile = [...gameState.playPile, playedCard]
        
        let newDirection = direction
        if (card.value === 10) {
            newDirection = direction === 'clockwise' ? 'counter-clockwise' : 'clockwise'
            setDirection(newDirection)
        }
        
        const updatedPlayers = gameState.players.map(p =>
            p.id === playerId ? { ...p, hand: newHand } : p
        )
        
        let nextTurn = getNextTurn(playerId, newDirection, updatedPlayers)
        
        if (card.value === 11) {
            nextTurn = getNextTurn(nextTurn, newDirection, updatedPlayers)
        }
        
        let newDeck = [...gameState.deck]
        
        if (card.drawValue > 0) {
            const nextPlayer = updatedPlayers.find(p => p.id === nextTurn)
            if (nextPlayer) {
                for (let i = 0; i < card.drawValue; i++) {
                    const drawnCard = newDeck.shift()
                    if (drawnCard) nextPlayer.hand.push(drawnCard)
                }
                addMessage(`You played ${getCardName(card)} and ${nextPlayer.name} drew ${card.drawValue} cards`)
            }
        } else {
            addMessage(`You played ${getCardName(card)}`)
        }
        
        if (newHand.length === 1) {
            triggerUno(playerId)
            addMessage(`You said UNO!`)
        }
        
        const newGameState = {
            ...gameState,
            players: updatedPlayers,
            playPile: newPlayPile,
            deck: newDeck
        }
        
        setGameState(newGameState)
        setCurrentTurn(nextTurn)
        
        // Sync with other players in multiplayer
        if (selectedMode === 'multiplayer' && pusherChannel) {
            console.log('📤 Syncing game state after card play...')
            pusherChannel.trigger('client-game-event', {
                type: 'SYNC_STATE',
                playerId: playerId,
                data: { gameState: newGameState }
            })
        }
        
        if (card.color === 'any' && card.drawValue === 0) {
            setColorPickerOpen(true)
        }
    }

    const handleDrawCard = () => {
        if (!gameState || currentTurn !== playerId || colorPickerOpen) return
        
        const player = gameState.players.find(p => p.id === playerId)
        if (!player) return
        
        const newDeck = [...gameState.deck]
        const drawnCard = newDeck.shift()
        if (!drawnCard) return
        
        const newHand = [...player.hand, drawnCard]
        
        const updatedPlayers = gameState.players.map(p =>
            p.id === playerId ? { ...p, hand: newHand } : p
        )
        
        audioManager.play('drawCard')
        addMessage(`You drew a card`)
        
        const newGameState = {
            ...gameState,
            players: updatedPlayers,
            deck: newDeck
        }
        
        setGameState(newGameState)
        
        // Check if drawn card can be played
        const topCard = gameState.playPile[gameState.playPile.length - 1]
        const canPlay = drawnCard.color === topCard.color ||
                       drawnCard.value === topCard.value ||
                       drawnCard.color === 'any' ||
                       topCard.color === 'any'
        
        if (!canPlay) {
            const nextTurn = getNextTurn(playerId, direction, updatedPlayers)
            setCurrentTurn(nextTurn)
            
            // Sync with other players in multiplayer
            if (selectedMode === 'multiplayer' && pusherChannel) {
                console.log('📤 Syncing game state after draw...')
                pusherChannel.trigger('client-game-event', {
                    type: 'SYNC_STATE',
                    playerId: playerId,
                    data: { gameState: { ...newGameState, currentTurn: nextTurn } }
                })
            }
        } else {
            // Sync with other players in multiplayer
            if (selectedMode === 'multiplayer' && pusherChannel) {
                pusherChannel.trigger('client-game-event', {
                    type: 'SYNC_STATE',
                    playerId: playerId,
                    data: { gameState: newGameState }
                })
            }
        }
    }

    const handleColorChosen = (color: string) => {
        if (!gameState) return
        
        const newPlayPile = [...gameState.playPile]
        newPlayPile[newPlayPile.length - 1].color = color
        
        const newGameState = {
            ...gameState,
            playPile: newPlayPile
        }
        
        setGameState(newGameState)
        setColorPickerOpen(false)
        setSelectedWildColor(color)
        
        const nextTurn = getNextTurn(playerId, direction, gameState.players)
        setCurrentTurn(nextTurn)
        
        // Sync with other players in multiplayer
        if (selectedMode === 'multiplayer' && pusherChannel) {
            console.log('📤 Syncing game state after color choice...')
            pusherChannel.trigger('client-game-event', {
                type: 'SYNC_STATE',
                playerId: playerId,
                data: { gameState: newGameState }
            })
        }
    }
    // #endregion

    // #region URL PARAM HANDLER
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)
        const room = params.get('room')
        if (room) {
            console.log('🔗 Detected room in URL:', room)
            setRoomId(room)
            setSelectedMode('multiplayer')
        }
    }, [])
    // #endregion

    // #region RENDER COMPONENTS
    const renderMenu = () => (
        <div className="menu-container" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            background: 'linear-gradient(135deg, #1a472a 0%, #0d2818 100%)'
        }}>
            <div style={{
                background: 'rgba(0,0,0,0.8)',
                padding: '3rem',
                borderRadius: '2rem',
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
                border: '2px solid #ffd700',
                maxWidth: '500px',
                width: '100%'
            }}>
                <h1 style={{ fontSize: '3rem', color: '#ffd700', marginBottom: '2rem' }}>
                    🃏 UNO Multiplayer
                </h1>
                
                <div style={{ marginBottom: '2rem' }}>
                    <input
                        type="text"
                        placeholder="Enter your name"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        style={{
                            padding: '1rem',
                            fontSize: '1.1rem',
                            width: '100%',
                            marginBottom: '1rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #ffd700',
                            background: 'rgba(255,255,255,0.1)',
                            color: 'white',
                            textAlign: 'center'
                        }}
                    />
                </div>
                
                <div style={{ marginBottom: '2rem' }}>
                    <button
                        onClick={() => setSelectedMode('ai')}
                        style={{
                            padding: '1rem 2rem',
                            margin: '0 1rem',
                            fontSize: '1.2rem',
                            background: selectedMode === 'ai' ? '#4caf50' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        🤖 VS AI
                    </button>
                    <button
                        onClick={() => setSelectedMode('multiplayer')}
                        style={{
                            padding: '1rem 2rem',
                            margin: '0 1rem',
                            fontSize: '1.2rem',
                            background: selectedMode === 'multiplayer' ? '#4caf50' : '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        👥 Multiplayer
                    </button>
                </div>
                
                {selectedMode === 'ai' && (
                    <>
                        <div style={{ marginBottom: '2rem' }}>
                            <label style={{ fontSize: '1.2rem', display: 'block', marginBottom: '1rem' }}>
                                Number of Players:
                            </label>
                            <div>
                                {[2, 3, 4].map(count => (
                                    <button
                                        key={count}
                                        onClick={() => setPlayerCount(count as 2 | 3 | 4)}
                                        style={{
                                            padding: '0.8rem 1.5rem',
                                            margin: '0 0.5rem',
                                            fontSize: '1.1rem',
                                            background: playerCount === count ? '#4caf50' : '#555',
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '0.5rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {count} Players
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <button
                            onClick={startAIGame}
                            style={{
                                padding: '1rem 2rem',
                                fontSize: '1.3rem',
                                background: 'linear-gradient(135deg, #4caf50, #45a049)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                width: '100%'
                            }}
                        >
                            🎮 Start Game vs AI
                        </button>
                    </>
                )}
                
                {selectedMode === 'multiplayer' && (
                    <>
                        <button
                            onClick={createMultiplayerRoom}
                            style={{
                                padding: '1rem 2rem',
                                fontSize: '1.3rem',
                                background: 'linear-gradient(135deg, #2196f3, #1976d2)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.5rem',
                                cursor: 'pointer',
                                width: '100%',
                                marginBottom: '1rem'
                            }}
                        >
                            🏠 Create Room
                        </button>
                        
                        <div style={{ marginTop: '2rem' }}>
                            <input
                                type="text"
                                placeholder="Enter Room Code"
                                value={roomId}
                                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                                style={{
                                    padding: '1rem',
                                    fontSize: '1.1rem',
                                    width: '100%',
                                    marginBottom: '1rem',
                                    borderRadius: '0.5rem',
                                    border: '1px solid #ffd700',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: 'white',
                                    textAlign: 'center'
                                }}
                            />
                            <button
                                onClick={joinMultiplayerRoom}
                                style={{
                                    padding: '1rem 2rem',
                                    fontSize: '1.3rem',
                                    background: 'linear-gradient(135deg, #ff9800, #f57c00)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    cursor: 'pointer',
                                    width: '100%'
                                }}
                            >
                                🔗 Join Room
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )

    const renderWaitingRoom = () => (
        <div className="waiting-container" style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            background: 'linear-gradient(135deg, #1a472a 0%, #0d2818 100%)'
        }}>
            <div style={{
                background: 'rgba(0,0,0,0.8)',
                padding: '3rem',
                borderRadius: '2rem',
                textAlign: 'center',
                backdropFilter: 'blur(10px)',
                border: '2px solid #ffd700',
                maxWidth: '600px',
                width: '100%'
            }}>
                <h2 style={{ fontSize: '2rem', color: '#ffd700', marginBottom: '1rem' }}>
                    🎲 Waiting Room
                </h2>
                
                <div style={{
                    background: 'rgba(0,0,0,0.5)',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem'
                }}>
                    <p style={{ fontSize: '1.2rem' }}>
                        Room Code: <strong style={{ color: '#4caf50', fontSize: '1.5rem' }}>{roomId}</strong>
                    </p>
                    <button
                        onClick={copyInviteLink}
                        style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem 1rem',
                            background: '#2196f3',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        📋 Copy Invite Link
                    </button>
                </div>
                
                <div className="players-list" style={{ marginBottom: '2rem' }}>
                    <h3>Players ({players.length}/4):</h3>
                    {players.map(player => (
                        <div key={player.id} style={{
                            padding: '0.5rem',
                            margin: '0.5rem 0',
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: '0.5rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span>{player.name}</span>
                            <span>{player.id === playerId ? '(You)' : ''}</span>
                            <span>{player.id === playerId && isHost ? '👑 Host' : ''}</span>
                            <span>{player.isReady ? '✅ Ready' : '⏳ Waiting'}</span>
                        </div>
                    ))}
                </div>
                
                <div className="chat-messages" style={{
                    height: '200px',
                    overflowY: 'auto',
                    background: 'rgba(0,0,0,0.5)',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    textAlign: 'left'
                }}>
                    {messages.map((msg, i) => (
                        <div key={i}>{msg}</div>
                    ))}
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                    {isHost && (
                        <button
                            onClick={startMultiplayerGame}
                            style={{
                                flex: 1,
                                padding: '1rem 2rem',
                                fontSize: '1.2rem',
                                background: players.length >= 2 ? '#4caf50' : '#666',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.5rem',
                                cursor: players.length >= 2 ? 'pointer' : 'not-allowed'
                            }}
                            disabled={players.length < 2}
                        >
                            {players.length >= 2 ? 'Start Game 🚀' : `Waiting for ${2 - players.length} more player(s)...`}
                        </button>
                    )}
                    
                    <button
                        onClick={leaveRoom}
                        style={{
                            padding: '1rem 2rem',
                            fontSize: '1.2rem',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        Leave Room
                    </button>
                </div>
                
                {!isHost && players.length >= 2 && (
                    <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#ffd700' }}>
                        Waiting for host to start the game...
                    </p>
                )}
            </div>
        </div>
    )

    const renderGame = () => {
        if (!gameState) return null
        
        const currentPlayer = gameState.players.find(p => p.id === playerId)
        if (!currentPlayer) return null
        
        const topCard = gameState.playPile[gameState.playPile.length - 1]
        
        return (
            <main className="game-container">
                {/* Other Players */}
                {gameState.players.filter(p => p.id !== playerId).map((player) => (
                    <div key={player.id} className={`cpu-player ${player.position === 'top' ? 'cpu-top' : player.position === 'left' ? 'cpu-left' : 'cpu-right'}`}>
                        <div className="cpu-info">
                            <div className="cpu-name">{player.name} ({player.hand.length})</div>
                        </div>
                        <div className={player.position === 'left' || player.position === 'right' ? 'cpu-hand-vertical' : 'cpu-hand'}>
                            {player.hand.map((_card, i) => (
                                <Image
                                    key={i}
                                    src={'/images/back.png'}
                                    alt='card back'
                                    width={player.position === 'left' || player.position === 'right' ? 90 : 60}
                                    height={player.position === 'left' || player.position === 'right' ? 60 : 90}
                                    className={player.position === 'left' || player.position === 'right' ? 'cpu-card-vertical' : 'cpu-card'}
                                />
                            ))}
                        </div>
                        {showUno[player.id] && (
                            <div className={`cpu-animation-${player.position}`}>
                                <Image src='/images/uno!.png' alt='UNO!' width={80} height={40} />
                            </div>
                        )}
                    </div>
                ))}
                
                {/* CENTER PLAY AREA */}
                <div className='center-area'>
                    <div className='turn-indicator'>
                        <p className='turn-text'>
                            {currentTurn === playerId ? (
                                <span className='turn-player'>🎮 YOUR TURN 🎮</span>
                            ) : (
                                <span className='turn-cpu'>🤖 {gameState.players.find(p => p.id === currentTurn)?.name}'s TURN 🤖</span>
                            )}
                        </p>
                        <p style={{ fontSize: '1.4rem', marginTop: '0.8rem', fontWeight: 'bold', color: '#ffd700' }}>
                            📍 DIRECTION: {direction === 'clockwise' ? 'CLOCKWISE →' : 'COUNTER-CLOCKWISE ←'}
                        </p>
                    </div>
                    
                    <div className='last-played'>
                        <p>📋 Last Played Card</p>
                        <p className='last-played-card'>
                            {topCard && (
                                <>
                                    {topCard.playerId === playerId ? '👤 You played: ' : '🤖 Player played: '}
                                    {getCardName(topCard)}
                                    {topCard.drawValue > 0 && ` (+${topCard.drawValue})`}
                                </>
                            )}
                        </p>
                    </div>
                    
                    <div className='table-cards'>
                        <div className='play-pile'>
                            {topCard && (
                                <Image
                                    src={topCard.src}
                                    alt='play pile'
                                    width={120}
                                    height={180}
                                    style={{ borderRadius: '10px' }}
                                />
                            )}
                        </div>
                        
                        <div className='draw-pile' onClick={handleDrawCard} style={{
                            cursor: currentTurn === playerId && !colorPickerOpen ? 'pointer' : 'not-allowed',
                            opacity: currentTurn === playerId && !colorPickerOpen ? 1 : 0.6
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
                    
                    {/* Chat Messages */}
                    <div style={{
                        background: 'rgba(0,0,0,0.6)',
                        padding: '1rem',
                        borderRadius: '1rem',
                        marginTop: '1rem',
                        width: '100%',
                        maxWidth: '500px',
                        height: '150px',
                        overflowY: 'auto',
                        fontSize: '0.8rem',
                        textAlign: 'left'
                    }}>
                        {messages.map((msg, i) => (
                            <div key={i}>{msg}</div>
                        ))}
                    </div>
                    
                    <button
                        onClick={leaveRoom}
                        style={{
                            marginTop: '1rem',
                            padding: '0.5rem 1rem',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer'
                        }}
                    >
                        Leave Game
                    </button>
                </div>
                
                {/* PLAYER BOTTOM */}
                <div className='player-bottom'>
                    <div className="player-info">
                        <div className="player-name">YOU ({currentPlayer.hand.length} cards)</div>
                    </div>
                    <div className='player-hand'>
                        {currentPlayer.hand.map((card, i) => (
                            <Image
                                key={i}
                                src={card.src}
                                alt={`card ${i}`}
                                width={80}
                                height={120}
                                className='player-card'
                                onClick={() => handlePlayCard(i)}
                                style={{
                                    cursor: currentTurn === playerId && !colorPickerOpen ? 'pointer' : 'not-allowed',
                                    opacity: currentTurn === playerId && !colorPickerOpen ? 1 : 0.6
                                }}
                            />
                        ))}
                    </div>
                    {showUno[playerId] && (
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
                            <button className='red' onClick={() => handleColorChosen('rgb(255, 6, 0)')}>🔴 RED</button>
                            <button className='green' onClick={() => handleColorChosen('rgb(0, 170, 69)')}>🟢 GREEN</button>
                            <button className='blue' onClick={() => handleColorChosen('rgb(0, 150, 224)')}>🔵 BLUE</button>
                            <button className='yellow' onClick={() => handleColorChosen('rgb(255, 222, 0)')}>🟡 YELLOW</button>
                        </div>
                    </div>
                )}
            </main>
        )
    }
    // #endregion

    return (
        <>
            {gameMode === 'menu' && renderMenu()}
            {gameMode === 'waiting' && renderWaitingRoom()}
            {gameMode === 'playing' && renderGame()}
        </>
    )
}
