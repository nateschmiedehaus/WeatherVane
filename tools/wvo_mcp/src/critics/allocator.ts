import { Critic } from "./base.js";

export class AllocatorCritic extends Critic {
  protected command(profile: string): string | null {
    if (profile === "low") {
      return null;
    }

    const pytestCmd = [
      "PYTHONPATH=. pytest",
      "tests/test_allocator_routes.py",
      "tests/test_creative_route.py",
      "tests/apps/model/test_creative_response.py",
      "--maxfail=1",
    ].join(" ");

    return pytestCmd;
  }
}
