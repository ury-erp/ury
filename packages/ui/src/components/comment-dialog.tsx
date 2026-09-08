import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { Button } from './button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Textarea } from './textarea'

export interface CommentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (comment: string) => void
  initialComment?: string
  title?: string
  label?: string
  placeholder?: string
  cancelLabel?: string
  saveLabel?: string
}

export function CommentDialog({
  open,
  onOpenChange,
  onSave,
  initialComment = '',
  title = 'Comment',
  label = 'Note',
  placeholder = 'Add a note…',
  cancelLabel = 'Cancel',
  saveLabel = 'Save',
}: CommentDialogProps) {
  const [comment, setComment] = useState(initialComment)

  useEffect(() => {
    if (open) setComment(initialComment)
  }, [open, initialComment])

  const handleSave = () => {
    onSave(comment)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-600" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-2">
          <label htmlFor="ury-comment" className="mb-2 block text-sm font-medium text-gray-700">
            {label}
          </label>
          <Textarea
            id="ury-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={placeholder}
            className="h-32 resize-none"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button onClick={handleSave}>{saveLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
