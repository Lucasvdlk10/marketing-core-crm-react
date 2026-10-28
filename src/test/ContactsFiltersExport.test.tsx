import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
const exports = vi.hoisted(() => ({ xlsx: vi.fn() }));
vi.mock("../lib/exportReport", () => ({
  exportCsv: vi.fn(),
  exportPdf: vi.fn(),
  exportXlsx: exports.xlsx,
}));
import { ContactsPage } from "../pages/ContactsPage";

beforeEach(() => {
  exports.xlsx.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});

it("filters leads by source, status and the last 7 days", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-10-28T12:00:00-03:00"));
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<ContactsPage preview />);
  await user.click(screen.getByRole("button", { name: "Filtrar leads" }));
  const dialog = screen.getByRole("dialog", { name: "Filtros de leads" });
  await user.selectOptions(
    within(dialog).getByLabelText("Origem"),
    "Landing page",
  );
  await user.selectOptions(within(dialog).getByLabelText("Status"), "Novo");
  await user.selectOptions(
    within(dialog).getByLabelText("Período de entrada"),
    "7",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Aplicar filtros" }),
  );
  expect(screen.getByText("Ana Almeida")).toBeInTheDocument();
  expect(screen.queryByText("Bruno Dias")).not.toBeInTheDocument();
  expect(screen.getByText("1 lead filtrado")).toBeInTheDocument();
  vi.useRealTimers();
});

it("supports a custom entry period and exports only filtered leads to XLSX", async () => {
  const user = userEvent.setup();
  render(<ContactsPage preview />);
  await user.click(screen.getByRole("button", { name: "Filtrar leads" }));
  const dialog = screen.getByRole("dialog", { name: "Filtros de leads" });
  await user.selectOptions(
    within(dialog).getByLabelText("Período de entrada"),
    "custom",
  );
  await user.type(within(dialog).getByLabelText("Data inicial"), "2026-10-20");
  await user.type(within(dialog).getByLabelText("Data final"), "2026-10-20");
  await user.click(
    within(dialog).getByRole("button", { name: "Aplicar filtros" }),
  );
  expect(screen.getByText("Carolina Gomes")).toBeInTheDocument();
  expect(screen.queryByText("Ana Almeida")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Exportar leads" }));
  await user.click(screen.getByRole("button", { name: "Exportar XLSX" }));
  expect(exports.xlsx).toHaveBeenCalledWith(
    expect.objectContaining({
      rows: expect.arrayContaining([expect.arrayContaining(["Carolina Gomes"])]),
    }),
    "leads-filtrados",
  );
});
