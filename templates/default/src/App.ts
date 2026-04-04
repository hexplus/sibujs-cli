import {
  div, h1, h3, p, button, input, span,
  header, footer,
  signal, derived, each, array,
} from "sibujs";

function CounterDemo() {
  const [count, setCount] = signal(0);

  return div({
    class: "card",
    nodes: [
      h3({ class: "heading", nodes: "Counter" }),
      p({ class: "desc", nodes: "Basic signal reactivity." }),
      div({
        class: "row-lg",
        nodes: [
          button({ class: "btn", nodes: "−", on: { click: () => setCount(count() - 1) } }),
          span({ class: "count", nodes: () => String(count()) }),
          button({ class: "btn", nodes: "+", on: { click: () => setCount(count() + 1) } }),
          button({ class: "btn-ghost", nodes: "Reset", on: { click: () => setCount(0) } }),
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

  return div({
    class: "card",
    nodes: [
      h3({ class: "heading", nodes: "Todo List" }),
      p({ class: "desc", nodes: "Reactive list with array + each." }),
      div({
        class: "row",
        nodes: [
          input({
            class: "input",
            value: () => newText(),
            on: {
              input: (e) => setNewText((e.target as HTMLInputElement).value),
              keydown: (e) => { if ((e as KeyboardEvent).key === "Enter") addTodo(); },
            },
            placeholder: "Add a todo...",
          }),
          button({ class: "btn btn-primary", nodes: "Add", on: { click: addTodo } }),
        ],
      }),
      div({
        nodes: [
          each(
            todos,
            (todo) => {
              const isDone = () => todos().find((t) => t.id === todo().id)?.done ?? todo().done;
              return div({
                class: "todo-item",
                nodes: [
                  input({
                    type: "checkbox",
                    checked: isDone,
                    class: "checkbox",
                    on: { change: () => toggleTodo(todo().id) },
                  }),
                  span({
                    class: () => isDone() ? "todo-text todo-done" : "todo-text",
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
        class: "muted",
        nodes: () => `${remaining()} item${remaining() === 1 ? "" : "s"} remaining`,
      }),
    ],
  });
}

export function App() {
  return div({
    class: "page",
    nodes: [
      header({
        class: "header",
        nodes: [
          div({
            class: "container",
            nodes: [
              h1({ class: "title", nodes: "{{NAME}}" }),
              p({ class: "subtitle", nodes: "Welcome to your new Sibu app." }),
            ],
          }),
        ],
      }),

      div({ class: "container", nodes: [CounterDemo(), TodoDemo()] }),

      footer({
        class: "footer",
        nodes: [
          div({
            class: "container",
            nodes: "Built with Sibu — fine-grained reactivity, no virtual DOM.",
          }),
        ],
      }),
    ],
  });
}
