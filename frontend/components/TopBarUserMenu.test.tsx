import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopBarUserMenu } from "./TopBarUserMenu";

describe("TopBarUserMenu", () => {
  it("renders email and role badge", () => {
    render(<TopBarUserMenu email="a@b.co" role="admin" />);
    expect(screen.getByText("a@b.co")).toBeInTheDocument();
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  });
});
