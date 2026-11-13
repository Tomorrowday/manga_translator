// manga_ui/hooks/use-chapter-timer.ts
// Таймер работы над текущей главой (старт, стоп, локальный тик каждую секунду)

import { useState, useEffect, useCallback } from "react"
import { getChapterTimerStatus, startChapterTimer, stopChapterTimer } from "@/lib/api"

export interface UseChapterTimerReturn {
  isTimerRunning: boolean
  timerSeconds: number
  handleStartTimer: () => Promise<void>
  handleStopTimer: () => Promise<void>
}

export function useChapterTimer(currentChapterId: number | null): UseChapterTimerReturn {
  const [isTimerRunning, setIsTimerRunning] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)

  useEffect(() => {
    if (!currentChapterId) {
      setIsTimerRunning(false)
      setTimerSeconds(0)
      return
    }

    let active = true
    getChapterTimerStatus(currentChapterId)
      .then((res) => {
        if (!active) return
        setIsTimerRunning(res.is_running)
        setTimerSeconds(res.total_seconds)
      })
      .catch((e) => console.warn("Не удалось получить статус таймера:", e))

    return () => {
      active = false
    }
  }, [currentChapterId])

  useEffect(() => {
    if (!isTimerRunning) return
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isTimerRunning])

  const handleStartTimer = useCallback(async () => {
    if (!currentChapterId) return
    try {
      const res = await startChapterTimer(currentChapterId)
      if (res.success) {
        setIsTimerRunning(true)
        setTimerSeconds(res.total_seconds)
      }
    } catch (e) {
      console.error("Ошибка старта таймера:", e)
    }
  }, [currentChapterId])

  const handleStopTimer = useCallback(async () => {
    if (!currentChapterId) return
    try {
      const res = await stopChapterTimer(currentChapterId)
      if (res.success) {
        setIsTimerRunning(false)
        setTimerSeconds(res.total_seconds)
      }
    } catch (e) {
      console.error("Ошибка остановки таймера:", e)
    }
  }, [currentChapterId])

  return { isTimerRunning, timerSeconds, handleStartTimer, handleStopTimer }
}
