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
import type { Question, SortingConfig } from "../../types";
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
      className={`flex items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 text-sm font-medium text-neutral-800 select-none dark:bg-neutral-900 dark:text-neutral-200 ${
        isDragging
          ? "border-primary shadow-lg opacity-80 z-10"
          : "border-neutral-200 dark:border-neutral-700"
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 active:cursor-grabbing"
        aria-label="Seret untuk mengubah urutan"
      >
        ☰
      </span>
      <span className="flex-1">{label}</span>
    </div>
  );
}

export function SortingQuestion({ question, questionNumber }: Props) {
  const { answers, submitAnswer } = useExamStore();
  const config = question.config as SortingConfig;

  // `order` holds the CURRENT order of original indices.
  // e.g. order = [2, 0, 1] means item originally at index 2 is now first, etc.
  const savedOrder = (() => {
    try {
      const v = answers[question.id]?.answerValue;
      if (!v) return config.items.map((_, i) => i);
      return JSON.parse(v) as number[];
    } catch {
      return config.items.map((_, i) => i);
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
    <div className="flex-1 flex flex-col gap-6 p-6 rounded-2xl border border-neutral-200/60 bg-white dark:border-neutral-800/60 dark:bg-neutral-900 shadow-sm">
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <span className="text-sm font-semibold uppercase tracking-wider text-primary bg-primary/5 px-3 py-1 rounded-full">
          Urutkan
        </span>
        <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">
          Nomor {questionNumber} dari {useExamStore.getState().questions.length}
        </span>
      </div>

      <RichContent
        html={question.text}
        className="question-html text-lg font-medium text-neutral-900 dark:text-neutral-100 leading-relaxed"
      />

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Seret item untuk mengubah urutannya dari yang benar.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {order.map((origIdx) => (
              <SortableItem
                key={origIdx}
                id={String(origIdx)}
                label={config.items[origIdx]}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
