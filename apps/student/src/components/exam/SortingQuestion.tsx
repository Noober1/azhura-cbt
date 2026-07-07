import { useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Question, SortingStudentConfig } from "../../types";
import { useExamStore } from "../../stores/exam";
import { RichContent } from "./RichContent";

interface Props {
  question: Question;
  questionNumber: number;
}

interface SortableItemProps {
  id: string;
  label: string;
}

function SortableItem({ id, label }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 text-sm font-medium text-neutral-800 select-none ${
        isDragging
          ? "border-primary shadow-[3px_3px_0_var(--nb-ink)] opacity-80 z-10"
          : "border-soft"
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-muted-foreground dark:hover:text-muted-foreground active:cursor-grabbing"
        aria-label="Seret untuk mengubah urutan"
      >
        ☰
      </span>
      <span className="flex-1">{label}</span>
    </div>
  );
}

export function SortingQuestion({ question, questionNumber }: Props) {
  const { answers, submitAnswer, questions } = useExamStore();
  // The server sends `items` already shuffled by a secret per-session
  // permutation, so the correct order is never pre-shown and "already sorted"
  // is not the answer. The client works purely in display-index space and
  // submits its arrangement of display indices; the server grades against the
  // permutation it kept.
  const items = ((question.config as SortingStudentConfig)?.items) ?? [];

  // `order` holds the CURRENT arrangement of display indices.
  // e.g. order = [2, 0, 1] means the item shown at display position 2 is now
  // first, etc. Default: identity (the server-shuffled order as received).
  const savedOrder = (() => {
    try {
      const v = answers[question.id]?.answerValue;
      if (!v) return items.map((_, i) => i);
      return JSON.parse(v) as number[];
    } catch {
      return items.map((_, i) => i);
    }
  })();

  const [order, setOrder] = useState(savedOrder);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // IDs for DndContext must be strings.
  const itemIds = order.map((origIdx) => String(origIdx));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = itemIds.indexOf(String(active.id));
    const newIndex = itemIds.indexOf(String(over.id));
    const newOrder = arrayMove(order, oldIndex, newIndex);
    setOrder(newOrder);
    await submitAnswer(question.id, null, JSON.stringify(newOrder));
  }

  return (
    <div className="flex-1 flex flex-col gap-6 p-6 rounded-2xl border-[2.5px] border-[var(--nb-ink)] bg-white shadow-[3px_3px_0_var(--nb-ink)]">
      <div className="flex items-center justify-between pb-4 border-b border-soft">
        <span className="text-sm font-semibold uppercase tracking-wider text-primary bg-primary/5 px-3 py-1 rounded-full">
          Urutkan
        </span>
        <span className="text-sm font-bold text-muted-foreground">
          Nomor {questionNumber} dari {questions.length}
        </span>
      </div>

      <RichContent
        html={question.text}
        questionId={question.id}
        className="question-html text-lg font-medium text-foreground leading-relaxed"
      />

      <p className="text-xs text-muted-foreground">
        Seret item untuk mengubah urutannya dari yang benar.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {order.map((origIdx) => (
              <SortableItem
                key={origIdx}
                id={String(origIdx)}
                label={items[origIdx] ?? ""}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
