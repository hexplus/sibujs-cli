import { div, h1, p, span, input } from "sibujs";
import { signal, derived, each, array } from "sibujs";
import {
  Button, badgeVariants,
  Card, CardHeader, CardTitle, CardDescription, CardContent,
  Checkbox,
} from "sibujs-ui";

function CounterDemo() {
  const [count, setCount] = signal(0);
  const label = derived(() => count() === 0 ? "default" as const : count() > 0 ? "secondary" as const : "destructive" as const);

  return Card({
    nodes: [
      CardHeader({
        nodes: [
          CardTitle({ nodes: "Counter" }),
          CardDescription({ nodes: "Basic signal reactivity with UI components." }),
        ],
      }),
      CardContent({
        nodes: [
          div({
            class: "flex items-center gap-3",
            nodes: [
              Button({ variant: "outline", size: "sm", nodes: "−", on: { click: () => setCount(count() - 1) } }),
              span({ class: () => badgeVariants({ variant: label() }), nodes: () => String(count()) }),
              Button({ variant: "outline", size: "sm", nodes: "+", on: { click: () => setCount(count() + 1) } }),
              Button({ variant: "ghost", size: "sm", nodes: "Reset", on: { click: () => setCount(0) } }),
            ],
          }),
        ],
      }),
    ],
  });
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
    setTodos(todos().map((t) => t.id === id ? { ...t, done: !t.done } : t));
  }

  return Card({
    nodes: [
      CardHeader({
        nodes: [
          CardTitle({ nodes: "Todo List" }),
          CardDescription({ nodes: "Reactive list with array + each." }),
        ],
      }),
      CardContent({
        nodes: [
          div({
            class: "flex gap-2 mb-4",
            nodes: [
              input({
                class: "flex-1 h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
                value: () => newText(),
                on: {
                  input: (e) => setNewText((e.target as HTMLInputElement).value),
                  keydown: (e) => { if ((e as KeyboardEvent).key === "Enter") addTodo(); },
                },
                placeholder: "Add a todo...",
              }),
              Button({ nodes: "Add", on: { click: addTodo } }),
            ],
          }),
          div({
            class: "space-y-2",
            nodes: [
              each(
                todos,
                (todo) => {
                  const isDone = () => todos().find((t) => t.id === todo().id)?.done ?? todo().done;
                  return div({
                    class: "flex items-center gap-3 py-1",
                    nodes: [
                      Checkbox({
                        defaultChecked: todo().done,
                        onCheckedChange: () => toggleTodo(todo().id),
                      }),
                      span({
                        class: () => isDone()
                          ? "flex-1 text-sm line-through text-muted-foreground"
                          : "flex-1 text-sm",
                        nodes: () => todo().text,
                      }),
                    ],
                  });
                },
                { key: (t) => t.id },
              ),
            ],
          }),
          p({
            class: "text-xs text-muted-foreground mt-3",
            nodes: () => `${remaining()} item${remaining() === 1 ? "" : "s"} remaining`,
          }),
        ],
      }),
    ],
  });
}

export function App() {
  return div({
    class: "min-h-screen bg-background",
    nodes: [
      div({
        class: "border-b",
        nodes: [
          div({
            class: "max-w-3xl mx-auto px-6 py-8",
            nodes: [
              h1({ class: "text-3xl font-bold tracking-tight", nodes: "{{NAME}}" }),
              p({ class: "text-muted-foreground mt-2", nodes: "Welcome to your new Sibu app." }),
            ],
          }),
        ],
      }),

      div({
        class: "max-w-3xl mx-auto px-6 py-8 grid gap-6",
        nodes: [CounterDemo(), TodoDemo()],
      }),

      div({
        class: "border-t",
        nodes: [
          div({
            class: "max-w-3xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground",
            nodes: "Built with Sibu + sibujs-ui.",
          }),
        ],
      }),
    ],
  });
}
