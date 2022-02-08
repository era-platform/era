# Era

[![CI](https://github.com/era-platform/era/actions/workflows/ci.yml/badge.svg)](https://github.com/era-platform/era/actions/workflows/ci.yml)


Programming is full of complexity. Even just learning a few languages to get something done is hard, but learning to maintain one's own development environment is harder, and learning ways to publish one's development tools for use by others is harder. The Era project is an attempt to cut to the core of that complexity and not only provide simpler, more self-sufficient development suites for programming, but to reduce the number of situations for which programming is necessary in the first place.

In the long term, we envision the use of interactive hypertext documents as source code, containing live collaborative UIs. Instead of building programs for an unknown audience of users and potentially misunderstanding that audience's needs altogether, people could use Era to discuss and experiment in direct collaboration with each other, addressing their actual needs in the moment. When they do come up with something worth publishing to a broader audience, they can improvise it from what they've created together, without an architectural design phase that puts them at a distance from the consequences of their code.

We think proximity to the consequences of the code will not only make it easier to experiment and learn, but easier for software development teams to take responsibility for their work.

We think an emphasis on collaboration will not only make it easier for people to build up their skills together, but easier for individuals to form improvisational organizations to take collective action in a way usually only enjoyed by tech companies.

In the short term, Era is a series of programming languages which aim for minimalism and extensibility similar to or exceeding that of the Lisp family of languages. Minimalism helps ensure that if people have better ideas, they can rebuild Era's languages with their new ideas in place and carry on using the code they already have. Extensibility helps ensure that people don't have to remake the whole language when they do this; they can just extend the parts they need to.

As we build up to implementing Era, we're also implementing various utility libraries that serve to smooth the rough corners of existing languages and give them some of Era's features. We call these libraries [Lathe](https://github.com/lathe) and group them under their own GitHub organization.

One of the major short-term goals of Era is to settle on a serializable representation for program modules. We'd like this to be capable of being a general-purpose knowledge representation format, and we'd rather not require people to think about installation directories or environment variables. This repository contains a few attempts at this, and our latest development efforts on this front are going on in the [Cene Mk. II repository](https://github.com/era-platform/cene-for-racket).

This repository currently contains a few sub-projects that preceded the development of Cene Mk. I ([website](https://era-platform.github.io/cene/), [repository](https://github.com/era-platform/cene)).

In this readme, links like this one will take you to live demos:

[Run some unit tests in your browser.](https://era-platform.github.io/era/demos/unit-tests.html)

Most of the demos aren't very interesting to view, but some are interactive.


## The Staccato language

[Run some Staccato tests in your browser.](https://era-platform.github.io/era/demos/staccato-runner-mini.html)

[Run tests that do some resource-heavy compilation.](https://era-platform.github.io/era/demos/staccato-runner.html)

[Run tests that do not use the reader.](https://era-platform.github.io/era/demos/staccato-gensym.html)

[Run tests that do not use the reader or any gensyms.](https://era-platform.github.io/era/demos/staccato.html)

The popular present-day programming languages have several superficial things in common: Most of them have interpreters, compilers, and/or servers you can run from the command line, which process a file tree full of plain text files. Most of them have some IDE support. Most of them have ways to install packages from the Web. While the broader Era project strives for a more interactive kind of program syntax and a simpler story for installing software modules, Staccato embraces this more well-trodden path.

> ℹ️ The Cene Mk. I ([website](https://era-platform.github.io/cene/), [repository](https://github.com/era-platform/cene)) and Cene Mk. II ([repository](https://github.com/era-platform/cene-for-racket)) projects carry on where Staccato left off. They don't share Staccato's emphasis on a serializable call stack with a predictable representation, but any future exploration along those lines will probably build upon Cene Mk. II.


### Staccato's run time semantics

The design of Staccato starts with a simple model for run time semantics: Semantically, every first-class value is a tagged record, and the stack is a simple list of values that will be called. Function definitions can be attached to tags, but the behavior of a single function must always take constant time. That way, a Staccato program can always be suspended in a well-defined state.

That well-defined state isn't always going to be useful, and it usually impedes optimizations and concurrency. Most of the time, the actual implementation details of a Staccato system will differ from this representation. However, it acts as a semantic structure against which Staccato step debuggers, profilers, JITs, reflective towers, etc. can be specified and understood.

Additionally, by considering every single first-class value to be a tagged record, Staccato is a good starting point for language features where selective encapsulation is needed: Function code is not encapsulated to everybody, but it is encapsulated to everybody who doesn't statically "know" the tag name, and this lack of knowledge can be enforced with sandbox abstractions, common Web service data security practices, or code signing.


### Staccato's textual syntax

[Run the reader in your browser. It's interactive!](https://era-platform.github.io/era/demos/reader.html)

Staccato's syntax is designed to get out of the way when dirty programming tricks are needed. The textual syntax is based on Lisp, but the simple addition of `(a b /c d)` syntax as an alternative to `(a b (c d))` means it's easy to write code in a way that avoids avoids heavy nesting:

```
(defn bag-minus a b
  (cast a bag a-avl-tree
    err.\;qq[Expected an a value of type bag]
  /cast b bag b-avl-tree
    err.\;qq[Expected a b value of type bag]
  /bag/bag-fold-asc a-avl-tree b /fn state elem
    (avl-minus-entry state elem)))
```

This has the crucial benefit that code written in continuation-passing style or monadic style can be formatted in a flat way, very much like imperative code:

```
(defn compile-def-type mode definition-ns name projection-list
  (bind-effects
    (procure-put-defined
      (ns-get-string str.projection-list
      /ns-get-name (constructor-name mode definition-ns name)
      /ns-get-name str.constructors definition-ns)
      projection-list)
  /fn -
  /bind-effects
    (procure-put-defined
      (ns-get-string str.function
      /ns-get-name (macro-name mode definition-ns name)
      /ns-get-name str.macros definition-ns)
      constructor-macro.projection-list)
  /fn -
  /no-effects/compile-ret-tuple mode definition-ns str.nil /nil))
```

(For a library that adds this weak opening paren functionality to Racket, see [Parendown](https://github.com/lathe/parendown-for-racket). This is also discussed in the [readme for Cene Mk. I](https://github.com/era-platform/cene#readme).)

Staccato's string literals are written `\;qq[...]` or `\;qq(...)`. Since this starts with a backslash and uses brackets, it's possible to write code that generates textual code that generates textual code, at any level of nesting, without needing to scatter escape sequences all over the code.

```
(fn -
  str.\;qq[
    (fn -
      str.\;qq[
        (fn -
          str.\;qq[Hello, world!])])])
```

The forward slash can even be used with string delimiters, facilitating a string-based continuation-passing style that would be nightmarish in other languages:

```
(fn - str.\;qq/
\/fn - str.\;qq/
\/fn - str.\;qq/
Hello, world!)
```

It's not recommended to write code in this style. However, this style is a natural consequence of using compilers that expect plain text as input. Since Staccato provides just such a compiler, we provide this support in case anyone ends up in the unfortunate position of needing it.

(This syntax is also discussed in the [readme for Cene Mk. I](https://github.com/era-platform/cene#readme).)

By default, the string syntax normalizes whitespace, so the above two examples are precisely equivalent. This is convenient for embedding natural language texts into the code, such as error messages. If necessary, individual whitespace characters can be specified explicitly using escape sequences, or whitespace normalization can be suppressed for a string altogether.


### Staccato's side effects

Staccato is a pure functional programming language with semi-determinism. That is, a Staccato function call has only one possible successful result value, but it may also encounter an error on the way there, and if it encounters an error, it doesn't always have to encounter the same one.

If a Staccato program needs to perform other side effects, it can do so by constructing a value representing the computation (almost a monadic style). Staccato's computation type supports a commutative operation for running multiple computations concurrently.

If a Staccato program needs to perform multiple side effects that aren't naturally commutative with each other, it must express them across multiple "ticks," using an effect that schedules another computation to happen in a future tick. Setting up a computation this way is commutative in the moment, but multiple ticks that are scheduled at once might be processed in an indeterministic order.

If the ticks are used in combination with concurrency, they'll tend to fan out and lose track of each other. When this happens, they can be synchronized again using promises.

This is a general approach to all kinds of side effects, and Staccato will have at least two disjoint effect systems designed this way: Services and macros. These are described below.


### Staccato's live services

Microservice architectures are becoming prominent for good reason: Humans and computer hardware happen to be interactive systems that maintain their identity over time. Software services can be peers in that respect, replacing and abstracting over hardware APIs.

For this reason, Staccato's error handling is based on the idea that there's a hardware service where the Staccato code is running, and this hardware service can be interacted with like any other service. In practice, instead of real hardware, this can be any kind of implementation of the Staccato language.

Live services live through continuous time; they don't inherently need a notion of discrete events. David Barbour's reactive demand programming (RDP) has explored a kind of stateless computation model with glitch tolerance. The idea of glitch tolerance is that if execution is somehow incorrect for a split second, it usually doesn't have large, lasting effects. To achieve this, at one point RDP had no notion of discrete events. All computation used a reactive model based on the transformation of one continuous timeline of state into another. Another glitch-tolerant aspect of RDP's design is its use of static delays, which make it predictable at what time an incorrect program or incorrect inputs will end up causing undesired results.

Staccato live services will be similar to RDP. They'll use continuous reactive semantics, and they'll pass around explicit licenses that authorize the use of persistent state for a limited time.


### Staccato's macros and namespaces

Because it must be easy to reimplement Era, it must be easy to reimplement Staccato. Staccato will support a macro system so people can easily bootstrap their slight extensions and modifications without reimplementing the whole language.

As far as modularity and encapsulation are concerned, Staccato macros are not a good alternative to writing functions; they are a good alternative to writing compilers. Nevertheless, if Staccato macros are written with a certain discipline, they can play well with other Staccato code; Common Lisp and Racket are examples of languages where this kind of discipline has paid off.

In particular, Staccato has a macro hygiene discipline. Macros pass around hierarchical namespaces, and the programmer should make sure to pass mutually exclusive namespaces to any two subcomputations that shouldn't be able to see each other's work. The global definition namespace is another parameter to the macro, and it's usually shared by all subcomputations, but it can be replaced with another namespace to achieve sandboxing.

A Staccato macro defined in any declaration in a codebase will be accessible anywhere else as long as there are no cyclic dependencies, and Staccato's top-level declarations will act concurrently. This concurrency will be an explicit form of side effects available to Staccato macro implementations. From the perspective of macro implementation code, installing a definition will be a commutative side effect, and looking one up will be a referentially transparent side effect.

To support incremental compilation, the macro system will pass around a value representing the current "time," which in this case means the current compilation. That way, a definition lookup may have a result that varies over multiple source code edits, while the function calls comprising that program's behavior remain deterministic.

(More or less the same model of macroexpansion is described in the [Cene Mk. I readme](https://github.com/era-platform/cene#readme). For [Cene Mk. II](https://github.com/era-platform/cene-for-racket), we're exploring a revision of this system so that individual files of code can be separately compiled. This will require being more restrictive and not necessarily allowing interactions between declarations in one file and declarations in another.)


## The Era module system

Although it hasn't been expanded upon in a while, the Era project started with the intention to publish programs using a module system that doubled as a monotonic knowledge representation. In such a system, the meaning of a module cannot change when other modules are installed, although it can become better understood.

The module system design will support selective encapsulation. If someone has a module installed, they know its source code, and they'll be able to use the fact that they know it. For instance, this will be useful for proving additional properties about code that has already been published. If a module can prove that it's by a particular author (e.g. using code signing), that'll be even better; it will be able to query all that author's code and private definitions. The notion of "private" isn't even needed; every definition can be published by one author and published for another. With this kind of system, there will be no need to have more than one declaration per module.

The Era module system will have a certain approach to the Expression Problem. The Expression Problem is usually understood as a problem of how to make a system extensible by more variants of objects and extensible by more operations over those objects at the same time. First, this simplifies if we look at "more operations" as "more variants of operations"; now we're just adding a variant to the system in both cases. Next, we can safely extend the system with a new type if we can prove that, for all possible sets of other people's extensions to the system, our extended implementation continues to behave the same way on the same inputs as the old implementation did.

Era's module system isn't ready yet, and it'll probably be a while before it's expressive enough to do that kind of proof in any interesting cases.

Michael Arntzenius's language [Datafun](https://github.com/rntz/datafun), which supports monotonic function types as a built-in concept, will probably reveal a much simpler way to design a monotonic knowledge representation like this one.


## The Penknife Mk. II language

[Run some compiled Penknife code in your browser.](https://era-platform.github.io/era/demos/penknife-compiled.html)

[Run some uncompiled Penknife code. It's resource-intensive, but it's interactive!](https://era-platform.github.io/era/demos/penknife.html)

The Era repository also houses Penknife Mk. II, the successor of [Penknife Mk. I](https://github.com/rocketnia/penknife). Penknife Mk. II shares Staccato's syntax, and it was the original testing bed that the weak opening paren syntax and string quasiquotation syntax were developed for.

Penknife has a novel system of dynamically controlled aliasing of variable bindings. If a variable is used fewer than once or more than once in its lexical scope, a dynamic behavior is called. This dynamic behavior is user-defined, but it can do resource cleanup, throw errors (for values that should not usually be aliased), or even create multiple completely different values to use for each of the variable usage sites. This experiment was intended for the purpose of easily constructing graphs that encoded the data flow of a variable. The design worked. However, we haven't found much use for these graphs without a corresponding way to track control flow (as in MELL proof nets).

(The `Drop` and `Dup` traits in Rust resemble Penknife's dynamically controlled aliasing.)

Penknife also has a way to enforce purity of subcomputations, effectively by making all side effects depend on a global state that can be temporarily replaced to forbid effects. Like Haskell's ST monad, there's a corresponding way for a pure Penknife computation to create a world of mutable boxes that it can temporarily take advantage of to employ impure programming techniques. Once the world expires, its boxes can no longer be modified.

Penknife's implementation is in continuation-passing style -- actually, a sort of world-passing and continuation-passing style -- and since it was so frustrating to write this in JavaScript, it motivated the creation of Staccato as a way to generate it automatically. Ironically, this was also a contributing step toward Staccato's side effect style, which has world-passing and continuation-passing aspects to it as well.


## Various notes

The [notes/](notes) subdirectory contains a collection of unsorted words about topics in and around Era. The file [src/era-tacit.js](src/era-tacit.js) is mostly useful for its unsorted notes as well.

I (Rocketnia) have frequently revisited the topic of combining the calculus of structures (deep inference) with the calculus of constructions (dependent types). The calculus of structures is appealing to me because it embraces the ability to manipulate local structure regardless of what's going on in the rest of the world. For instance, this could be a way to apply logical inferences for reasoning about the behavior of one module without regard for what other modules the system may be extended with.

The Era approach to modules will already let programs be broken apart to one definition per module, and the calculus of structures could potentially let the expressions themselves be broken apart into an individual connective per module. But combining the calculus of structures with dependent typing has been quite a challenge.

Much more recently, I've come to understand the calculus of structures as really being a form of functoriality, in a category-theoretic sense. Each syntactic construct making up a structured program is a functor of some sort, and the ability to locally manipulate pieces of the program without disrupting the rest of it can be thought of as a kind of functor mapping operation. As such, I expect many of the gaps in the ideas I've expressed in these notes could be filled with insights from dependently typed languages that can internalize higher-dimensional category structure, like cubical type theory.


## Installation and use

Mostly, this repository is a collection of demos.

First, install Node.js, clone this repo, run `npm install` in the repo directory, and try running `./build-era.js -h` to see available options. You can run `npm run build` to build all the files used by the HTML demo pages, and you can run `npm test` to run the command-line unit tests.
