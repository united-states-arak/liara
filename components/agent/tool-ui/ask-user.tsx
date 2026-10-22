"use client";

import { useState } from "react";
import { useAuiState, type ToolCallMessagePartComponent } from "@assistant-ui/react";
import { HelpCircle, Send } from "lucide-react";
import type { AskUserResult } from "@/lib/agent/tool-results";
import { cn } from "@/lib/utils";
import { ToolCard } from "./shared";

type Question = {
  id: string;
  question: string;
  options?: string[];
  allowFreeform?: boolean;
};

type Args = { questions?: Question[] };

function answerFor(choice: string | undefined, text: string): string | undefined {
  const typed = text.trim();
  if (typed) return typed;
  return choice;
}

function QuestionField({
  question,
  choice,
  text,
  disabled,
  onChoice,
  onText,
}: {
  question: Question;
  choice: string | undefined;
  text: string;
  disabled: boolean;
  onChoice: (value: string) => void;
  onText: (value: string) => void;
}) {
  const options = question.options ?? [];
  const freeform = question.allowFreeform === true || options.length === 0;
  const inputId = `ask-${question.id}`;

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="text-sm font-medium">{question.question}</legend>
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => {
            const selected = choice === option;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => onChoice(option)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-50",
                  selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : null}
      {freeform ? (
        <label htmlFor={inputId} className="sr-only">
          {options.length > 0 ? `Other answer for: ${question.question}` : question.question}
        </label>
      ) : null}
      {freeform ? (
        <input
          id={inputId}
          type="text"
          value={text}
          onChange={(event) => onText(event.target.value)}
          placeholder={options.length > 0 ? "Other…" : "Type your answer"}
          className="bg-background focus-visible:ring-ring/50 rounded-md border px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2"
        />
      ) : null}
    </fieldset>
  );
}

export const AskUserToolUI: ToolCallMessagePartComponent<Args, AskUserResult> = ({
  args,
  result,
  addResult,
}) => {
  const canAnswer = useAuiState((s) => s.thread.capabilities.answerToolCall);
  const [choices, setChoices] = useState<Record<string, string | undefined>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const questions = args.questions ?? [];

  if (result !== undefined) {
    return (
      <ToolCard slot="agent-ask-user" title="Your answers" icon={HelpCircle}>
        <dl className="flex flex-col gap-1.5 text-sm">
          {questions.map((question) => (
            <div key={question.id} className="flex min-w-0 flex-col">
              <dt className="text-muted-foreground text-xs">{question.question}</dt>
              <dd className="font-medium break-words">{result.answers?.[question.id] ?? "—"}</dd>
            </div>
          ))}
        </dl>
      </ToolCard>
    );
  }

  const answers = questions.map((question) =>
    answerFor(choices[question.id], texts[question.id] ?? ""),
  );
  const complete = questions.length > 0 && answers.every((answer) => answer !== undefined);
  const disabled = !canAnswer || submitting;

  const submit = () => {
    if (!complete || disabled) return;
    setSubmitting(true);
    const payload: AskUserResult = {
      answers: Object.fromEntries(
        questions.map((question, index) => [question.id, answers[index] ?? ""]),
      ),
    };
    addResult(payload);
  };

  return (
    <ToolCard slot="agent-ask-user" title="A few questions" icon={HelpCircle}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {questions.map((question) => (
          <QuestionField
            key={question.id}
            question={question}
            choice={choices[question.id]}
            text={texts[question.id] ?? ""}
            disabled={disabled}
            onChoice={(value) => {
              setChoices((current) => ({ ...current, [question.id]: value }));
              setTexts((current) => ({ ...current, [question.id]: "" }));
            }}
            onText={(value) => {
              setTexts((current) => ({ ...current, [question.id]: value }));
              if (value.trim()) {
                setChoices((current) => ({ ...current, [question.id]: undefined }));
              }
            }}
          />
        ))}
        <div className="flex items-center justify-end gap-2">
          {!complete && questions.length > 0 ? (
            <span className="text-muted-foreground text-xs">
              Answer every question to continue.
            </span>
          ) : null}
          <button
            type="submit"
            disabled={!complete || disabled}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <Send className="size-3.5" aria-hidden />
            Send answers
          </button>
        </div>
      </form>
    </ToolCard>
  );
};
