/**
 * Azhura CBT Console — form field primitives (Field, Input, Textarea, Checkbox).
 *
 * Field wraps a labelled control with optional hint/error text and wires the
 * label to the control for accessibility.
 */

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (controlId: string) => ReactNode;
}

export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[0.8125rem] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children(id)}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL_BASE =
  "focus-ring w-full rounded-[var(--radius-field)] border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint transition-colors hover:border-faint disabled:opacity-60";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input className={`${CONTROL_BASE} h-10 ${className}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return <textarea className={`${CONTROL_BASE} py-2 leading-relaxed ${className}`} {...rest} />;
}

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Checkbox({ checked, onChange, label, hint, disabled = false }: CheckboxProps) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-3 rounded-[var(--radius-field)] border border-line bg-surface px-3 py-2.5 transition-colors ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-faint"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="focus-ring mt-0.5 size-4 accent-[var(--color-accent)] disabled:cursor-not-allowed"
      />
      <span className="flex flex-col">
        <span className="text-sm text-ink">{label}</span>
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </span>
    </label>
  );
}
