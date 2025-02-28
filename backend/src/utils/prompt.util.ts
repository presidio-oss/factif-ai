import { IClickableElement } from "../services/interfaces/BrowserService";

export function convertElementsToInput(
  availableElements: IClickableElement[],
): string {
  const list = availableElements
    .map(
      (element, index) =>
        `[${index}]: <${element.tagName} ${Object.entries(element.attributes)
          .map((attr) => `${attr[0]}="${attr[1]}"`)
          .join(
            " ",
          )}>${element.text}</${element.tagName}>: [${element.coordinate.x},${element.coordinate.y}]:[${element.isVisibleInCurrentViewPort ? (element.isVisuallyVisible ? "visible in the current viewport" : "Overlay by another element. Handle the overlay first. Visually identify the overlay element") : "Not available in current viewport. Available on scroll"}]`,
    )
    .join("\n");
  return list;
}
