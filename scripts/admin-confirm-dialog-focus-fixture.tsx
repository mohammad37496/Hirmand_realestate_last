/* eslint-disable react-refresh/only-export-components -- test harness exports a mount helper alongside its fixture. */
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useConfirmDialog } from "../src/components/hirmand/admin-ui-utils";

function ConfirmDialogFocusFixture() {
  const { confirm, dialog } = useConfirmDialog();
  const [result, setResult] = useState("pending");
  const open = () => {
    setResult("pending");
    void confirm({ title: "QA confirmation dialog" }).then((accepted) => setResult(accepted ? "confirmed" : "cancelled"));
  };
  return (
    <section id="qa-confirm-dialog-focus-fixture">
      <button type="button" data-confirm-flow="cancel" onClick={open}>Open cancel confirmation</button>
      <button type="button" data-confirm-flow="confirm" onClick={open}>Open confirm confirmation</button>
      <button type="button" data-confirm-flow="escape" onClick={open}>Open Escape confirmation</button>
      {dialog}
      <output data-confirm-result="">{result}</output>
    </section>
  );
}

export function mountAdminConfirmDialogFocusFixture(target: HTMLElement): Root {
  const container = document.createElement("div");
  container.id = "qa-confirm-dialog-focus-root";
  target.append(container);
  const root = createRoot(container);
  root.render(<ConfirmDialogFocusFixture />);
  return root;
}
