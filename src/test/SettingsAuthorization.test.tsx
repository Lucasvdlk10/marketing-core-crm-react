import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsPage, type CompanyProfile } from "../pages/SettingsPage";
import { AppShell } from "../components/layout/AppShell";
import { canManageSettings, canManageTeam } from "../lib/authorization";

const profile: CompanyProfile = {
  name: "Marketing Core",
  tagline: "Estratégia",
  logoUrl: "./assets/core-mark.svg",
};

describe("Settings autenticada e autorização", () => {
  it("aguarda a persistência remota antes de confirmar e usa o valor lido de volta", async () => {
    const user = userEvent.setup();
    let resolveSave: (profile: CompanyProfile) => void = () => {};
    const onSave = vi.fn(
      () =>
        new Promise<CompanyProfile>((resolve) => {
          resolveSave = resolve;
        }),
    );
    render(<SettingsPage authenticated profile={profile} onSave={onSave} />);
    const name = screen.getByRole("textbox", { name: "NOME DA EMPRESA" });
    await user.clear(name);
    await user.type(name, "Marketing Core Brasil");
    await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
    expect(screen.getByRole("button", { name: "Salvando..." })).toBeDisabled();
    expect(screen.queryByText("Alterações salvas")).not.toBeInTheDocument();
    resolveSave({ ...profile, name: "Marketing Core Brasil confirmado" });
    expect(await screen.findByText("Alterações salvas")).toBeInTheDocument();
    expect(name).toHaveValue("Marketing Core Brasil confirmado");
  });

  it("não apresenta persistência local como configuração autenticada", () => {
    render(
      <SettingsPage
        authenticated
        profile={profile}
        onSave={async (next) => next}
      />,
    );
    expect(screen.getByLabelText("Alterar imagem")).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "TAGLINE" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Negociações" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Equipe e acesso" }),
    ).toBeDisabled();
  });

  it("usa o papel da associação real para proteger equipe e configurações", () => {
    expect(canManageTeam("owner")).toBe(true);
    expect(canManageSettings("admin")).toBe(true);
    expect(canManageTeam("marketing_manager")).toBe(false);
    expect(canManageSettings("sdr")).toBe(false);
  });

  it("oculta equipe e configurações da navegação sem permissão", () => {
    render(
      <MemoryRouter>
        <AppShell role="employee" workspace={profile} userName="Pessoa">
          <div />
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("nav-team")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-settings")).not.toBeInTheDocument();
  });
});
