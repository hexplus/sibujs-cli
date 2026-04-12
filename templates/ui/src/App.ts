import { array, derived, div, each, h1, input, p, signal, span } from "sibujs";
import {
  badgeVariants,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
} from "sibujs-ui";

function CounterDemo() {
  const [count, setCount] = signal(0);
  const label = derived(() =>
    count() === 0 ? ("default" as const) : count() > 0 ? ("secondary" as const) : ("destructive" as const),
  );

  return Card([
    CardHeader([
      CardTitle("Counter"),
      CardDescription("Basic signal reactivity with UI components."),
    ]),
    CardContent([
      div("flex items-center gap-3", [
        Button({ variant: "outline", size: "sm", on: { click: () => setCount(count() - 1) } }, "−"),
        span({ class: () => badgeVariants({ variant: label() }) }, () => String(count())),
        Button({ variant: "outline", size: "sm", on: { click: () => setCount(count() + 1) } }, "+"),
        Button({ variant: "ghost", size: "sm", on: { click: () => setCount(0) } }, "Reset"),
      ]),
    ]),
  ]);
}

function TodoDemo() {
  const [todos, { push, set: setTodos }] = array([
    { id: 1, text: "Learn Sibu", done: true },
    { id: 2, text: "Build something awesome", done: false },
  ]);
  const [nextId, setNextId] = signal(3);
  const [newText, setNewText] = signal("");
  const remaining = derived(() => todos().filter((t) => !t.done).length);

  function addTodo() {
    const text = newText().trim();
    if (!text) return;
    push({ id: nextId(), text, done: false });
    setNextId(nextId() + 1);
    setNewText("");
  }

  function toggleTodo(id: number) {
    setTodos(todos().map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  return Card([
    CardHeader([
      CardTitle("Todo List"),
      CardDescription("Reactive list with array + each."),
    ]),
    CardContent([
      div("flex gap-2 mb-4", [
        input({
          class:
            "flex-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          value: () => newText(),
          placeholder: "Add a todo...",
          on: {
            input: (e) => setNewText((e.target as HTMLInputElement).value),
            keydown: (e) => {
              if ((e as KeyboardEvent).key === "Enter") addTodo();
            },
          },
        }),
        Button({ on: { click: addTodo } }, "Add"),
      ]),
      div(
        "space-y-2",
        each(
          todos,
          (todo) => {
            const isDone = () => todos().find((t) => t.id === todo().id)?.done ?? todo().done;
            return div("flex items-center gap-3 py-1", [
              Checkbox({
                defaultChecked: todo().done,
                onCheckedChange: () => toggleTodo(todo().id),
              }),
              span(
                { class: () => (isDone() ? "flex-1 text-sm line-through text-muted-foreground" : "flex-1 text-sm") },
                () => todo().text,
              ),
            ]);
          },
          { key: (t) => t.id },
        ),
      ),
      p("text-xs text-muted-foreground mt-3", () => `${remaining()} item${remaining() === 1 ? "" : "s"} remaining`),
    ]),
  ]);
}

export function App() {
  return div("min-h-screen bg-background", [
    div("border-b", [
      div("max-w-3xl mx-auto px-6 py-8", [
        h1("text-3xl font-bold tracking-tight", "{{NAME}}"),
        p("text-muted-foreground mt-2", "Welcome to your new Sibu app."),
      ]),
    ]),

    div("max-w-3xl mx-auto px-6 py-8 grid gap-6", [CounterDemo(), TodoDemo()]),

    div("border-t", [
      div("max-w-3xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground", "Built with Sibu + sibujs-ui."),
    ]),
  ]);
}
