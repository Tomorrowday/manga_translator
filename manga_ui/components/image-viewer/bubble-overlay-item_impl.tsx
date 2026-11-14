// manga_ui/components/image-viewer/bubble-overlay-item_impl.tsx
// Наложение интерактивного бабла на скан: переключение редактора, тайпсета и цветной рамки разметки

"use client"

import React, { memo, useState } from "react"
import type { EditAction } from "@/hooks/use-box-transform"
import type { BubbleOverlayItemProps } from "./bubble-overlay-item"
import { useBubbleScreenLayout } from "./use-bubble-screen-layout"
import { BubbleInlineEditor } from "./bubble-inline-editor"
import { BubbleJapTooltip } from "./bubble-jap-tooltip"
import { BubbleResizeHandles } from "./bubble-resize-handles"
import { BubbleTypesetView } from "./bubble-typeset-view"
import { BubbleColorFrameView } from "./bubble-color-frame-view"

export const BubbleOverlayItem = memo(function BubbleOverlayItem({
  box,
  index,
  titleId,
  isSelected,
  showTypeset,
  showJapOverlay = false,
  imgElement,
  isEditingCurrent,
  editType,
  activeBox,
  activeRotation,
  defaultFontSize = 14,
  onStartTransform,
  onSelect,
  onUpdate,
}: BubbleOverlayItemProps) {
  const isDraft = box.id === "__draft__"
  const hasTranslation = Boolean(box.rusText && box.rusText.trim())
  const isEllipse = box.shape === "ellipse"
  const isWhiteText = box.textColor === "white"

  const [isInlineEditing, setIsInlineEditing] = useState(false)

  const currentX = isEditingCurrent && activeBox ? activeBox.x : box.x
  const currentY = isEditingCurrent && activeBox ? activeBox.y : box.y
  const currentW = isEditingCurrent && activeBox ? activeBox.width : box.width
  const currentH = isEditingCurrent && activeBox ? activeBox.height : box.height
  const currentRot = isEditingCurrent && editType === "rotate" ? activeRotation : box.rotation || 0

  const {
    screenLines,
    editableLines,
    finalScreenFontSize,
    finalScreenLineHeight,
    currentFont,
    masterBoxPixelH,
    screenScale,
    computeReflowedState,
  } = useBubbleScreenLayout({ imgElement, box, currentW, currentH, defaultFontSize })

  const handleMouseDown = (e: React.MouseEvent, action: EditAction) => {
    if (isInlineEditing) return
    e.stopPropagation()
    onSelect(box.id)
    onStartTransform(e, box, action)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isDraft) return
    e.stopPropagation()
    onSelect(box.id)
    setIsInlineEditing(true)
  }

  const handlesNode = (
    <BubbleResizeHandles
      isSelected={isSelected}
      isInlineEditing={isInlineEditing}
      currentRot={currentRot}
      isEditingCurrent={isEditingCurrent}
      editType={editType}
      onStartAction={handleMouseDown}
    />
  )

  const japTooltipNode = (
    <BubbleJapTooltip
      box={box}
      index={index}
      titleId={titleId}
      isSelected={isSelected}
      showJapOverlay={showJapOverlay}
      isDraft={isDraft}
      isInlineEditing={isInlineEditing}
      currentX={currentX}
      currentY={currentY}
      currentW={currentW}
      currentH={currentH}
      currentRot={currentRot}
      onSelect={onSelect}
      onUpdate={onUpdate}
    />
  )

  const positionProps = {
    currentX,
    currentY,
    currentW,
    currentH,
    currentRot,
    onMouseDown: handleMouseDown,
    onDoubleClick: handleDoubleClick,
    handles: handlesNode,
    japTooltip: japTooltipNode,
  }

  if (isInlineEditing) {
    return (
      <BubbleInlineEditor
        box={box}
        editableLines={editableLines}
        currentX={currentX}
        currentY={currentY}
        currentW={currentW}
        currentH={currentH}
        currentRot={currentRot}
        currentFont={currentFont}
        isWhiteText={isWhiteText}
        finalScreenFontSize={finalScreenFontSize}
        finalScreenLineHeight={finalScreenLineHeight}
        masterBoxPixelH={masterBoxPixelH}
        screenScale={screenScale}
        computeReflowedState={computeReflowedState}
        onUpdate={onUpdate}
        onClose={() => setIsInlineEditing(false)}
      />
    )
  }

  if (showTypeset && !isDraft && hasTranslation) {
    return (
      <BubbleTypesetView
        box={box}
        screenLines={screenLines}
        isEllipse={isEllipse}
        isWhiteText={isWhiteText}
        isSelected={isSelected}
        showJapOverlay={showJapOverlay}
        currentFont={currentFont}
        finalScreenFontSize={finalScreenFontSize}
        finalScreenLineHeight={finalScreenLineHeight}
        {...positionProps}
      />
    )
  }

  return (
    <BubbleColorFrameView
      box={box}
      index={index}
      isDraft={isDraft}
      isEllipse={isEllipse}
      isSelected={isSelected}
      showJapOverlay={showJapOverlay}
      {...positionProps}
    />
  )
})
