import { isOverwolf } from "../../utils/overwolf";

// The Overwolf API persists hashes across app launches. Serialize updates so a
// sign-out cannot be overtaken by an earlier sign-in callback.
let requestedEmail: string | null | undefined;
let appliedEmail: string | null | undefined;
let updating = false;

const updateHashes = (email: string | null): Promise<void> =>
  new Promise((resolve, reject) => {
    const callback = (result: overwolf.Result) => {
      if (result.success) resolve();
      else reject(new Error(result.error || "Overwolf email hash update failed"));
    };

    if (email) {
      overwolf.extensions.current.generateUserEmailHashes(email, callback);
    } else {
      overwolf.extensions.current.setUserEmailHashes(
        {} as overwolf.extensions.current.UserEmailHashes,
        callback,
      );
    }
  });

export const syncOverwolfEmailHashes = (email: string | null): void => {
  if (!isOverwolf() ||
      typeof overwolf.extensions?.current?.generateUserEmailHashes !== "function" ||
      typeof overwolf.extensions.current.setUserEmailHashes !== "function") return;

  requestedEmail = email?.trim() || null;
  if (updating) return;
  updating = true;

  void (async () => {
    let failedEmail: string | null | undefined;
    try {
      while (requestedEmail !== appliedEmail) {
        const nextEmail = requestedEmail ?? null;
        try {
          await updateHashes(nextEmail);
        } catch (error) {
          failedEmail = nextEmail;
          throw error;
        }
        appliedEmail = nextEmail;
      }
    } catch (error) {
      console.error("Could not synchronize Overwolf email hashes", error);
    } finally {
      updating = false;
      if (failedEmail !== undefined && requestedEmail !== failedEmail) {
        syncOverwolfEmailHashes(requestedEmail ?? null);
      }
    }
  })();
};
