describe("Getting started with Cypress.io for end-to-end testing", () => {
  it("Does basic math", () => {
    expect(3 + 4).to.eq(7);
  });
  it("Doesn't pretend things are okay", () => {
    expect(3 + 4).to.eq(8);
  });
});
