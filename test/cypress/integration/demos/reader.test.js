describe("The reader demo page", () => {
  
  it("Reads and writes the example data", () => {
    cy.visit("demos/reader.html");
    
    const qq = "`";
    cy.get("textarea#result").should("have.value",
`foo
12
\\;qq[%\\t${qq}% []]
(a b c)
(a b)
((a b) c)
(a b /c d)`
    );
  });
  
  it("Reads and writes data supplied by the user", () => {
    cy.visit("demos/reader.html");
    
    cy.get("textarea#code")
      .clear()
      .type(`
        (a/wa/wa/wa)
        \\= Here's a comment.
        dot.notation
      `);
    cy.get("button#read").click();
    
    cy.get("textarea#result").should("have.value",
`(a /wa /wa /wa)
(dot notation)`
    );
  });
  
});
