import { render, screen } from "@testing-library/react";
import Home from "../app/page";

describe("Home page", () => {
  it("renders without crashing", () => {
    render(<Home />);
    expect(screen.getByText(/AssistantX Cloud/i)).toBeInTheDocument();
  });
});
