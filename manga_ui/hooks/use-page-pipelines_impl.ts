// manga_ui/hooks/use-page-pipelines_impl.ts
// Оркестратор пайплайнов: стейты загрузки и делегирование в hooks/pipelines/*

import { useState } from "react"
import type { UsePagePipelinesProps, UsePagePipelinesReturn } from "./use-page-pipelines"
import type { PagePipelineContext } from "./pipelines/types"
import { executeAutoDetect, executeOcrAllBlocks } from "./pipelines/detect-ocr-pipeline"
import { executeCleanPage, executeRevertClean } from "./pipelines/clean-pipeline"
import { executeTranslateAll } from "./pipelines/translate-pipeline"
import { executeExportPage, executeFullAuto } from "./pipelines/export-fullauto-pipeline"

export function usePagePipelines(props: UsePagePipelinesProps): UsePagePipelinesReturn {
  const [isDetecting, setIsDetecting] = useState(false)
  const [isOcrRunning, setIsOcrRunning] = useState(false)
  const [isBatchTranslating, setIsBatchTranslating] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [isRevertingClean, setIsRevertingClean] = useState(false)
  const [isFullAuto, setIsFullAuto] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportSuccess, setIsExportSuccess] = useState(false)

  const ctx: PagePipelineContext = {
    ...props,
    setIsDetecting,
    setIsOcrRunning,
    setIsBatchTranslating,
    setIsCleaning,
    setIsRevertingClean,
    setIsFullAuto,
    setIsExporting,
    setIsExportSuccess,
  }

  const handleAutoDetect = () => executeAutoDetect(ctx)
  const handleOcrAllBlocks = () => executeOcrAllBlocks(ctx)
  const handleTranslateAll = () => executeTranslateAll(ctx)
  const handleCleanPage = (mode: "auto" | "lama" | "white" = "auto") => executeCleanPage(ctx, mode)
  const handleRevertClean = () => executeRevertClean(ctx)
  const handleExportPage = () => executeExportPage(ctx)
  const handleFullAuto = () => executeFullAuto(ctx, handleAutoDetect)

  return {
    isDetecting,
    isOcrRunning,
    isBatchTranslating,
    isCleaning,
    isRevertingClean,
    isFullAuto,
    isExporting,
    isExportSuccess,
    handleAutoDetect,
    handleOcrAllBlocks,
    handleTranslateAll,
    handleCleanPage,
    handleRevertClean,
    handleExportPage,
    handleFullAuto,
  }
}
