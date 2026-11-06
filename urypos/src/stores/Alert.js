import { defineStore } from "pinia";

export const useAlert = defineStore("alert", {
  state: () => ({
    okButtonClicked: false,
  }),
  actions: {
    createAlert(title, message, buttonText) {
      return new Promise((resolve) => {
        // Create a backdrop for the modal
        const backdrop = document.createElement("div");
        backdrop.classList.add(
          "fixed",
          "inset-0",
          "z-50",
          "bg-black",
          "opacity-50",
          "backdrop-blur-md"
        );
        document.body.appendChild(backdrop);

        // Create the modal container
        const modal = document.createElement("div");
        modal.classList.add(
          "fixed",
          "top-10",
          "z-50",
          "lg:left-1/2",
          "transform",
          "lg:-translate-x-1/2",
          "bg-white",
          "p-6",
          "rounded-lg",
          "shadow-lg",
          "w-100"
        );
        const mediaQuery = window.matchMedia("(max-width: 767px)");
        if (mediaQuery.matches) {
          modal.classList.remove("lg:left-1/2", "lg:-translate-x-1/2");
          modal.classList.add("left-0", "right-0");
        }
        document.body.appendChild(modal);

        // Create the modal content using safe DOM construction so that
        // untrusted alert values are rendered as text, never as markup.
        const modalContent = document.createElement("div");

        const heading = document.createElement("h2");
        heading.classList.add("text-base", "font-semibold", "mb-4");
        heading.textContent = title;

        const divider = document.createElement("hr");
        divider.classList.add("my-6", "border-t", "border-gray-300");

        const messageParagraph = document.createElement("p");
        messageParagraph.classList.add("mb-4", "text-justify", "text-sm");
        messageParagraph.textContent = message;

        const closeButton = document.createElement("button");
        closeButton.classList.add(
          "bg-blue-700",
          "md:ml-96",
          "ml-64",
          "text-white",
          "px-4",
          "py-2",
          "rounded-md"
        );
        closeButton.textContent = buttonText;

        modalContent.appendChild(heading);
        modalContent.appendChild(divider);
        modalContent.appendChild(messageParagraph);
        modalContent.appendChild(closeButton);

        modal.appendChild(modalContent);

        // Close the modal and remove the backdrop when the button is clicked
        closeButton.addEventListener("click", () => {
          modal.remove();
          backdrop.remove();
          resolve();
          this.okButtonClicked = true;
        });
      });
    },
  },
});
