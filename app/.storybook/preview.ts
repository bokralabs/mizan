import "../src/app/globals.css";

const preview = {
  parameters: {
    layout: "fullscreen",
    controls: {
      expanded: true,
    },
    backgrounds: {
      default: "mizan-dark",
      values: [
        { name: "mizan-dark", value: "#0F1117" },
        { name: "mizan-light", value: "#FAFAF8" },
      ],
    },
    options: {
      storySort: {
        order: ["Generative UI"],
      },
    },
  },
};

export default preview;
