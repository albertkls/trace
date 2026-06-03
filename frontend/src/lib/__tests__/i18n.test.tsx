import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { I18nProvider, useI18n } from "@/lib/i18n";

function TestConsumer() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="cancel">{t("common.cancel")}</span>
      <span data-testid="fallback-success">{t("nonexistent.key", "fallback")}</span>
      <span data-testid="fallback-missing">{t("nonexistent.key")}</span>
      <button data-testid="set-en" onClick={() => setLocale("en")}>
        set en
      </button>
      <button data-testid="set-zh" onClick={() => setLocale("zh")}>
        set zh
      </button>
    </div>
  );
}

function renderWithI18n(ui: React.ReactElement) {
  return render(ui, {
    wrapper: ({ children }) => <I18nProvider>{children}</I18nProvider>,
  });
}

describe("i18n", () => {
  let getItemStub: ReturnType<typeof vi.fn>;
  let setItemStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getItemStub = vi.fn(() => null);
    setItemStub = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: getItemStub,
      setItem: setItemStub,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses default locale zh when localStorage has no value", () => {
    getItemStub.mockReturnValue(null);
    const { getByTestId } = renderWithI18n(<TestConsumer />);
    expect(getByTestId("locale").textContent).toBe("zh");
  });

  it('t("common.cancel") returns "取消"', () => {
    getItemStub.mockReturnValue(null);
    const { getByTestId } = renderWithI18n(<TestConsumer />);
    expect(getByTestId("cancel").textContent).toBe("取消");
  });

  it("t returns fallback when key does not exist", () => {
    getItemStub.mockReturnValue(null);
    const { getByTestId } = renderWithI18n(<TestConsumer />);
    expect(getByTestId("fallback-success").textContent).toBe("fallback");
  });

  it("t returns key when no fallback provided", () => {
    getItemStub.mockReturnValue(null);
    const { getByTestId } = renderWithI18n(<TestConsumer />);
    expect(getByTestId("fallback-missing").textContent).toBe("nonexistent.key");
  });

  it("returns English translation after switching locale to en", () => {
    getItemStub.mockReturnValue(null);
    const { getByTestId } = renderWithI18n(<TestConsumer />);

    // Start with zh
    expect(getByTestId("locale").textContent).toBe("zh");
    expect(getByTestId("cancel").textContent).toBe("取消");

    // Switch to en
    act(() => {
      getByTestId("set-en").click();
    });

    expect(getByTestId("locale").textContent).toBe("en");
    expect(getByTestId("cancel").textContent).toBe("Cancel");
  });

  it("persists locale to localStorage when changed", () => {
    getItemStub.mockReturnValue(null);
    const { getByTestId } = renderWithI18n(<TestConsumer />);
    act(() => {
      getByTestId("set-en").click();
    });
    expect(setItemStub).toHaveBeenCalledWith("trace_locale", "en");
  });

  it("restores locale from localStorage if set", () => {
    getItemStub.mockReturnValue("en");
    const { getByTestId } = renderWithI18n(<TestConsumer />);
    expect(getByTestId("locale").textContent).toBe("en");
    expect(getByTestId("cancel").textContent).toBe("Cancel");
  });
});
