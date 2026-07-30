import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';

const SEARCHING_MESSAGES = [
  'Buscando...',
  'En camino...',
  'Vamos guacho',
  'Con este la rompés',
  'Rastreando la red',
  'Cazando el tema',
  'Escarbando SoulSeek',
  'Ya casi lo tengo',
  'Afilando la púa',
  'Esto va a sonar',
  'Tremendo temazo',
  'Pateando la pista',
]


export default function SearchingLabel({ className = '' }) {
  // Arranca en un índice random para que filas simultáneas no muestren todas
  // el mismo cartel sincronizado.
  const [i, setI] = useState(() => Math.floor(Math.random() * SEARCHING_MESSAGES.length))
  const [show, setShow] = useState(true)
  useEffect(() => {
    let swapTimer
    const id = setInterval(() => {
      setShow(false) // fade-out del cartel actual
      swapTimer = setTimeout(() => {
        setI(prev => (prev + 1) % SEARCHING_MESSAGES.length)
        setShow(true) // fade-in del siguiente
      }, 200)
    }, 1800)
    return () => { clearInterval(id); clearTimeout(swapTimer) }
  }, [])
  return (
    <span className={className}>
      <span
        className={`inline-block transition-all duration-200 ease-out will-change-transform ${
          show ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 -translate-y-1 blur-[1px]'
        }`}
      >
        {SEARCHING_MESSAGES[i]}
      </span>
    </span>
  )
}
