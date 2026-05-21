import { isPywebviewDesktop } from "./appInfo";

export async function chooseLocalFile(): Promise<string | null> {
  if (!isPywebviewDesktop()) return null;
  const chooseFile = window.pywebview?.api?.choose_file;
  if (!chooseFile) return null;
  return chooseFile();
}
