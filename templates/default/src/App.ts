import { array, button, derived, div, each, footer, h1, h3, header, input, p, signal, span } from "sibujs";

function CounterDemo() {
  const [count, setCount] = signal(0);

  return div("card", [
    h3("heading", "Counter"),
    p("desc", "Basic signal reactivity."),
    div("row-lg", [
      button({ class: "btn", on: { click: () => setCount(count() - 1) } }, "−"),
      span("count", () => String(count())),
      button({ class: "btn", on: { click: () => setCount(count() + 1) } }, "+"),
      button({ class: "btn-ghost", on: { click: () => setCount(0) } }, "Reset"),
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

  return div("card", [
    h3("heading", "Todo List"),
    p("desc", "Reactive list with array + each."),
    div("row", [
      input({
        class: "input",
        value: () => newText(),
        placeholder: "Add a todo...",
        on: {
          input: (e) => setNewText((e.target as HTMLInputElement).value),
          keydown: (e) => {
            if ((e as KeyboardEvent).key === "Enter") addTodo();
          },
        },
      }),
      button({ class: "btn btn-primary", on: { click: addTodo } }, "Add"),
    ]),
    div(
      each(
        todos,
        (todo) => {
          const isDone = () => todos().find((t) => t.id === todo().id)?.done ?? todo().done;
          return div("todo-item", [
            input({
              type: "checkbox",
              checked: isDone,
              class: "checkbox",
              on: { change: () => toggleTodo(todo().id) },
            }),
            span({ class: () => (isDone() ? "todo-text todo-done" : "todo-text") }, () => todo().text),
          ]);
        },
        { key: (t) => t.id },
      ),
    ),
    p("muted", () => `${remaining()} item${remaining() === 1 ? "" : "s"} remaining`),
  ]);
}

export function App() {
  return div("page", [
    header("header", [
      div("container", [
        h1("title", "{{NAME}}"),
        p("subtitle", "Welcome to your new Sibu app."),
      ]),
    ]),

    div("container", [CounterDemo(), TodoDemo()]),

    footer("footer", [
      div("container", "Built with Sibu — fine-grained reactivity, no virtual DOM."),
    ]),
  ]);
}
