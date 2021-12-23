import {
  assert,
  assertArrayIncludes,
  assertEquals,
  assertNotEquals,
  assertThrows,
} from "https://deno.land/std@0.119.0/testing/asserts.ts";
import { Construct, ConstructOrder, IConstruct } from "../deno/construct.ts";
import { Dependable, DependencyGroup } from "../deno/dependency.ts";
import { App as Root } from "./util.ts";

Deno.test('the "Root" construct is a special construct which can be used as the root of the tree', () => {
  const root = new Root();
  const node = root.node;
  assertEquals(node.id, "");
  assertEquals(node.scope, undefined);
  assertEquals(node.children.length, 0);
});

Deno.test("an empty string is a valid name for the root construct", () => {
  const root = new Root();
  assertEquals(root.node.id, "");

  assertThrows(() => new Construct(root, ""), Error, "Only root constructs");
});

Deno.test("construct.name returns the name of the construct", () => {
  const t = createTree();

  assertEquals(t.child1.node.id, "Child1");
  assertEquals(t.child2.node.id, "Child2");
  assertEquals(t.child1_1.node.id, "Child11");
  assertEquals(t.child1_2.node.id, "Child12");
  assertEquals(t.child1_1_1.node.id, "Child111");
  assertEquals(t.child2_1.node.id, "Child21");
});

Deno.test("construct id can use any character except the path separator", () => {
  const root = new Root();
  new Construct(root, "valid");
  new Construct(root, "ValiD");
  new Construct(root, "Va123lid");
  new Construct(root, "v");
  new Construct(root, "  invalid");
  new Construct(root, "invalid   ");
  new Construct(root, "123invalid");
  new Construct(root, "in valid");
  new Construct(root, "in_Valid");
  new Construct(root, "in-Valid");
  new Construct(root, "in\\Valid");
  new Construct(root, "in.Valid");
});

Deno.test("if construct id contains path seperators, they will be replaced by double-dash", () => {
  const root = new Root();
  const c = new Construct(root, "Boom/Boom/Bam");
  assertEquals(c.node.id, "Boom--Boom--Bam");
});

Deno.test('if "undefined" is forcefully used as an "id", it will be treated as an empty string', () => {
  const c = new Construct(undefined as any, undefined as any);
  assertEquals(c.node.id, "");
});

Deno.test("node.addr returns an opaque app-unique address for any construct", () => {
  const root = new Root();

  const child1 = new Construct(root, "This is the first child");
  const child2 = new Construct(child1, "Second level");
  const c1 = new Construct(child2, "My construct");
  const c2 = new Construct(child1, "My construct");

  assertEquals(
    c1.node.path,
    "This is the first child/Second level/My construct",
  );
  assertEquals(c2.node.path, "This is the first child/My construct");
  assertEquals(child1.node.addr, "c8a0dfcbdc45cb728d75ebe6914d369e565dc3f61c");
  assertEquals(child2.node.addr, "c825c5541e02ebd68e79ea636e370985b6c2de40a9");
  assertEquals(c1.node.addr, "c83a2846e506bcc5f10682b564084bca2d275709ee");
  assertEquals(c2.node.addr, "c8003bcb3e82977712d0d7220b155cb69abd9ad383");
});

Deno.test('node.addr excludes "default" from the address calculation', () => {
  // GIVEN
  const root = new Root();
  const c1 = new Construct(root, "c1");

  // WHEN:
  const group1 = new Construct(root, "Default"); // <-- this is a "hidden node"
  const c1a = new Construct(group1, "c1");
  const group2 = new Construct(root, "DeFAULt"); // <-- not hidden, "Default" is case sensitive
  const c1b = new Construct(group2, "c1");

  // THEN: all addresses are the same because they go through "default"
  const addr = c1.node.addr;
  const addrA = c1a.node.addr;
  const addrB = c1b.node.addr;

  assertEquals(addr, "c86a34031367d11f4bef80afca42b7e7e5c6253b77");
  assertEquals(addrA, addr);
  assertEquals(addrB, "c8fa72abd28f794f6bacb100b26beb761d004572f5");
  assertNotEquals(addrB, addr);
});

Deno.test("construct.getChildren() returns an array of all children", () => {
  const root = new Root();
  const child = new Construct(root, "Child1");
  new Construct(root, "Child2");
  assertEquals(child.node.children.length, 0);
  assertEquals(root.node.children.length, 2);
});

Deno.test("construct.findChild(name) can be used to retrieve a child from a parent", () => {
  const root = new Root();
  const child = new Construct(root, "Contruct");
  assertEquals(root.node.tryFindChild(child.node.id), child);
  assertEquals(root.node.tryFindChild("NotFound"), undefined);
});

Deno.test("construct.getChild(name) can be used to retrieve a child from a parent", () => {
  const root = new Root();
  const child = new Construct(root, "Contruct");
  assertEquals(root.node.findChild(child.node.id), child);
  assertThrows(
    () => root.node.findChild("NotFound"),
    Error,
    "No child with id: 'NotFound'",
  );
});

Deno.test("construct.getContext(key) can be used to read a value from context defined at the root level", () => {
  const context = {
    ctx1: 12,
    ctx2: "hello",
  };

  const t = createTree(context);
  assertEquals(t.child1_2.node.tryGetContext("ctx1"), 12);
  assertEquals(t.child1_1_1.node.tryGetContext("ctx2"), "hello");
});

Deno.test("construct.setContext(k,v) sets context at some level and construct.getContext(key) will return the lowermost value defined in the stack", () => {
  const root = new Root();
  const highChild = new Construct(root, "highChild");
  highChild.node.setContext("c1", "root");
  highChild.node.setContext("c2", "root");

  const child1 = new Construct(highChild, "child1");
  child1.node.setContext("c2", "child1");
  child1.node.setContext("c3", "child1");

  const child2 = new Construct(highChild, "child2");
  const child3 = new Construct(child1, "child1child1");
  child3.node.setContext("c1", "child3");
  child3.node.setContext("c4", "child3");

  assertEquals(highChild.node.tryGetContext("c1"), "root");
  assertEquals(highChild.node.tryGetContext("c2"), "root");
  assertEquals(highChild.node.tryGetContext("c3"), undefined);

  assertEquals(child1.node.tryGetContext("c1"), "root");
  assertEquals(child1.node.tryGetContext("c2"), "child1");
  assertEquals(child1.node.tryGetContext("c3"), "child1");

  assertEquals(child2.node.tryGetContext("c1"), "root");
  assertEquals(child2.node.tryGetContext("c2"), "root");
  assertEquals(child2.node.tryGetContext("c3"), undefined);

  assertEquals(child3.node.tryGetContext("c1"), "child3");
  assertEquals(child3.node.tryGetContext("c2"), "child1");
  assertEquals(child3.node.tryGetContext("c3"), "child1");
  assertEquals(child3.node.tryGetContext("c4"), "child3");
});

Deno.test("construct.setContext(key, value) can only be called before adding any children", () => {
  const root = new Root();
  new Construct(root, "child1");
  assertThrows(
    () => root.node.setContext("k", "v"),
    Error,
    "Cannot set context after children have been added: child1",
  );
});

Deno.test("construct.pathParts returns an array of strings of all names from root to node", () => {
  const tree = createTree();
  assertEquals(tree.root.node.path, "");
  assertEquals(tree.child1_1_1.node.path, "HighChild/Child1/Child11/Child111");
  assertEquals(tree.child2.node.path, "HighChild/Child2");
});

Deno.test("if a root construct has a name, it should be included in the path", () => {
  const tree = createTree({});
  assertEquals(tree.root.node.path, "");
  assertEquals(tree.child1_1_1.node.path, "HighChild/Child1/Child11/Child111");
});

Deno.test("construct can not be created with the name of a sibling", () => {
  const root = new Root();

  // WHEN
  new Construct(root, "SameName");

  // THEN: They have different paths
  assertThrows(
    () => new Construct(root, "SameName"),
    Error,
    "There is already a Construct with name 'SameName' in App",
  );

  // WHEN
  const c0 = new Construct(root, "c0");
  new Construct(c0, "SameName");

  // THEN: They have different paths
  assertThrows(
    () => new Construct(c0, "SameName"),
    Error,
    "There is already a Construct with name 'SameName' in Construct \[c0\]",
  );
});

Deno.test("addMetadata(type, data) can be used to attach metadata to constructs", () => {
  const root = new Root();
  const con = new Construct(root, "MyConstruct");
  assertEquals(con.node.metadata, []);

  const node = con.node;
  (function FIND_ME() { // <-- Creates a stack trace marker we'll be able to look for
    node.addMetadata("key", "value", { stackTrace: true });
    node.addMetadata("number", 103);
    node.addMetadata("array", [123, 456]);
  })();

  assertEquals(node.metadata[0].type, "key");
  assertEquals(node.metadata[0].data, "value");
  assertEquals(node.metadata[1].data, 103);
  assertEquals(node.metadata[2].data, [123, 456]);

  assertArrayIncludes(node.metadata[0].trace?.[0] ?? [], "FIND_ME");
});

Deno.test('addMetadata() respects the "stackTrace" option', () => {
  const root = new Root();
  const con = new Construct(root, "Foo");

  con.node.addMetadata("foo", "bar1", { stackTrace: true });
  con.node.addMetadata("foo", "bar2", { stackTrace: false });

  assertEquals(con.node.metadata.length, 2);
  assert(con.node.metadata[0]?.trace?.length ?? 0 > 0);
  assertEquals(con.node.metadata[1]?.trace, undefined);
});

Deno.test("addMetadata(type, undefined/null) is ignored", () => {
  const root = new Root();
  const con = new Construct(root, "Foo");
  const node = con.node;
  node.addMetadata("Null", null);
  node.addMetadata("Undefined", undefined);
  node.addMetadata("True", true);
  node.addMetadata("False", false);
  node.addMetadata("Empty", "");

  const exists = (key: string) => node.metadata.find((x) => x.type === key);

  assert(!exists("Null"));
  assert(!exists("Undefined"));
  assert(exists("True"));
  assert(exists("False"));
  assert(exists("Empty"));
});

Deno.test("multiple children of the same type, with explicit names are welcome", () => {
  const root = new Root();
  new MyBeautifulConstruct(root, "mbc1");
  new MyBeautifulConstruct(root, "mbc2");
  new MyBeautifulConstruct(root, "mbc3");
  new MyBeautifulConstruct(root, "mbc4");
  assert(root.node.children.length >= 4);
});

Deno.test("node.addValidation() can be implemented to perform validation, node.validate() will return errors", () => {
  class MyConstruct extends Construct {
    constructor(scope: Construct, id: string) {
      super(scope, id);

      this.node.addValidation({ validate: () => ["my-error1", "my-error2"] });
    }
  }

  class YourConstruct extends Construct {
    constructor(scope: Construct, id: string) {
      super(scope, id);

      this.node.addValidation({ validate: () => ["your-error1"] });
    }
  }

  class TheirConstruct extends Construct {
    constructor(scope: Construct, id: string) {
      super(scope, id);

      new YourConstruct(this, "YourConstruct");

      this.node.addValidation({ validate: () => ["their-error"] });
    }
  }

  class TestStack extends Root {
    constructor() {
      super();

      new MyConstruct(this, "MyConstruct");
      new TheirConstruct(this, "TheirConstruct");

      this.node.addValidation({ validate: () => ["stack-error"] });
    }
  }

  const stack = new TestStack();

  const validateTree = (root: Construct) => {
    const errors: ValidationError[] = [];
    for (const child of root.node.children) {
      errors.push(...validateTree(child));
    }

    errors.push(
      ...root.node.validate().map((message) => ({ source: root, message })),
    );
    return errors;
  };

  const errors = validateTree(stack)
    .map((v: ValidationError) => ({
      path: v.source.node.path,
      message: v.message,
    }));

  // validate DFS
  assertEquals(errors, [
    { path: "MyConstruct", message: "my-error1" },
    { path: "MyConstruct", message: "my-error2" },
    { path: "TheirConstruct/YourConstruct", message: "your-error1" },
    { path: "TheirConstruct", message: "their-error" },
    { path: "", message: "stack-error" },
  ]);
});

Deno.test("node.validate() returns an empty array if the construct does not implement IValidation", () => {
  // GIVEN
  const root = new Root();

  // THEN
  assertEquals(root.node.validate(), []);
});

Deno.test("node.addValidation() can be used to add a validation function to a construct", () => {
  // GIVEN
  const construct = new Root();
  construct.node.addValidation({ validate: () => ["error1", "error2"] });
  construct.node.addValidation({ validate: () => ["error3"] });

  assertEquals(construct.node.validate(), ["error1", "error2", "error3"]);
});

Deno.test("construct.lock() protects against adding children anywhere under this construct (direct or indirect)", () => {
  const root = new Root();

  const c0a = new Construct(root, "c0a");
  const c0b = new Construct(root, "c0b");

  const c1a = new Construct(c0a, "c1a");
  const c1b = new Construct(c0a, "c1b");

  c0a.node.lock();

  // now we should still be able to add children to c0b, but not to c0a or any its children
  new Construct(c0b, "c1a");
  assertThrows(
    () => new Construct(c0a, "fail1"),
    Error,
    'Cannot add children to "c0a" during synthesis',
  );
  assertThrows(
    () => new Construct(c1a, "fail2"),
    Error,
    'Cannot add children to "c0a\/c1a" during synthesis',
  );
  assertThrows(
    () => new Construct(c1b, "fail3"),
    Error,
    'Cannot add children to "c0a\/c1b" during synthesis',
  );

  new Construct(root, "c2");

  // lock root
  root.node.lock();
  assertThrows(
    () => new Construct(root, "test"),
    Error,
    "Cannot add children during synthesis",
  );
});

Deno.test("findAll returns a list of all children in either DFS or BFS", () => {
  // GIVEN
  const c1 = new Construct(undefined as any, "1");
  const c2 = new Construct(c1, "2");
  new Construct(c1, "3");
  new Construct(c2, "4");
  new Construct(c2, "5");

  // THEN
  const node = c1.node;
  assertEquals(
    node.findAll().map((x) => x.node.id),
    c1.node.findAll(ConstructOrder.PREORDER).map((x) => x.node.id),
  ); // default is PreOrder
  assertEquals(node.findAll(ConstructOrder.PREORDER).map((x) => x.node.id), [
    "1",
    "2",
    "4",
    "5",
    "3",
  ]);
  assertEquals(node.findAll(ConstructOrder.POSTORDER).map((x) => x.node.id), [
    "4",
    "5",
    "2",
    "3",
    "1",
  ]);
});

Deno.test("ancestors returns a list of parents up to root", () => {
  const { child1_1_1 } = createTree();
  assertEquals(child1_1_1.node.scopes.map((x) => x.node.id), [
    "",
    "HighChild",
    "Child1",
    "Child11",
    "Child111",
  ]);
});

Deno.test('"root" returns the root construct', () => {
  const { child1, child2, child1_1_1, root } = createTree();
  assertEquals(child1.node.root, root);
  assertEquals(child2.node.root, root);
  assertEquals(child1_1_1.node.root, root);
});

Deno.test('returns the child with id "Resource"', () => {
  const root = new Root();
  new Construct(root, "child1");
  const defaultChild = new Construct(root, "Resource");
  new Construct(root, "child2");

  assertEquals(root.node.defaultChild, defaultChild);
});
Deno.test('returns the child with id "Default"', () => {
  const root = new Root();
  new Construct(root, "child1");
  const defaultChild = new Construct(root, "Default");
  new Construct(root, "child2");

  assertEquals(root.node.defaultChild, defaultChild);
});
Deno.test("can override defaultChild", () => {
  const root = new Root();
  new Construct(root, "Resource");
  const defaultChild = new Construct(root, "OtherResource");
  root.node.defaultChild = defaultChild;

  assertEquals(root.node.defaultChild, defaultChild);
});
Deno.test('returns "undefined" if there is no default', () => {
  const root = new Root();
  new Construct(root, "child1");
  new Construct(root, "child2");

  assertEquals(root.node.defaultChild, undefined);
});
Deno.test('fails if there are both "Resource" and "Default"', () => {
  const root = new Root();
  new Construct(root, "child1");
  new Construct(root, "Default");
  new Construct(root, "child2");
  new Construct(root, "Resource");

  assertThrows(
    () => root.node.defaultChild,
    Error,
    'Cannot determine default child for . There is both a child with id "Resource" and id "Default"',
  );
});

Deno.test("addDependency() defines a dependency between two scopes", () => {
  // GIVEN
  const root = new Root();
  const consumer = new Construct(root, "consumer");
  const producer1 = new Construct(root, "producer1");
  const producer2 = new Construct(root, "producer2");

  // WHEN
  consumer.node.addDependency(producer1);
  consumer.node.addDependency(producer2);

  // THEN
  assertEquals(consumer.node.dependencies.map((x) => x.node.path), [
    "producer1",
    "producer2",
  ]);
});

Deno.test("are deduplicated", () => {
  // GIVEN
  const root = new Root();
  const consumer = new Construct(root, "consumer");
  const producer = new Construct(root, "producer");

  // WHEN
  consumer.node.addDependency(producer);
  consumer.node.addDependency(producer);
  consumer.node.addDependency(producer);
  consumer.node.addDependency(producer);

  // THEN
  assertEquals(consumer.node.dependencies.map((x) => x.node.path), [
    "producer",
  ]);
});

Deno.test("DependencyGroup can represent a group of disjoined producers", () => {
  // GIVEN
  const root = new Root();
  const group = new DependencyGroup(
    new Construct(root, "producer1"),
    new Construct(root, "producer2"),
  );
  const consumer = new Construct(root, "consumer");

  // WHEN
  group.add(new Construct(root, "producer3"), new Construct(root, "producer4"));
  consumer.node.addDependency(group);

  // THEN
  assertEquals(consumer.node.dependencies.map((x) => x.node.path), [
    "producer1",
    "producer2",
    "producer3",
    "producer4",
  ]);
});

Deno.test("Dependable.implement() can be used to implement IDependable on any object", () => {
  // GIVEN
  const root = new Root();
  const producer = new Construct(root, "producer");
  const consumer = new Construct(root, "consumer");

  // WHEN
  const foo = {};
  Dependable.implement(foo, {
    get dependencyRoots() {
      return [producer];
    },
  });
  consumer.node.addDependency(foo);

  // THEN
  assertEquals(Dependable.of(foo).dependencyRoots.map((x) => x.node.path), [
    "producer",
  ]);
  assertEquals(consumer.node.dependencies.map((x) => x.node.path), [
    "producer",
  ]);
});

Deno.test("Dependable.of() throws an error the object does not implement IDependable", () => {
  assertThrows(
    () => Dependable.of({}),
    Error,
    "does not implement IDependable",
  );
});

Deno.test("dependencyRoots are only resolved when node dependencies are evaluated", () => {
  // GIVEN
  const root = new Root();
  const c1 = new Construct(root, "c1");
  const c2 = new Construct(root, "c2");
  const c3 = new Construct(root, "c3");
  const group = new DependencyGroup();
  group.add(c2);
  c1.node.addDependency(group);

  // WHEN
  // add s3 after "addDependency" is called
  group.add(c3);

  // THEN
  assertEquals(c1.node.dependencies.length, 2);
  assertEquals(c1.node.dependencies.map((x) => x.node.path), ["c2", "c3"]);
});

Deno.test("DependencyGroup can also include other IDependables", () => {
  // GIVEN
  const root = new Root();
  const c1 = new Construct(root, "c1");

  // WHEN
  const groupA = new DependencyGroup(
    new Construct(root, "a1"),
    new Construct(root, "a2"),
  );
  const groupB = new DependencyGroup(
    new Construct(root, "b1"),
    new Construct(root, "b2"),
  );
  const composite = new DependencyGroup(groupA);

  c1.node.addDependency(composite);
  composite.add(groupB);
  groupB.add(new Construct(root, "b3"));

  // THEN
  assertEquals(c1.node.dependencies.map((x) => x.node.path), [
    "a1",
    "a2",
    "b1",
    "b2",
    "b3",
  ]);
  assertEquals(c1.node.dependencies.length, 5);
});

Deno.test("tryRemoveChild()", () => {
  // GIVEN
  const root = new Root();
  new Construct(root, "child1");
  new Construct(root, "child2");

  // WHEN
  assertEquals(root.node.children.length, 2);
  assert(root.node.tryRemoveChild("child1"));
  assert(!root.node.tryRemoveChild("child-not-found"));

  // THEN
  assertEquals(root.node.children.length, 1);
});

Deno.test("toString()", () => {
  // GIVEN
  const root = new Root();
  const child = new Construct(root, "child");
  const grand = new Construct(child, "grand");

  // THEN
  assertEquals(root.toString(), "<root>");
  assertEquals(child.toString(), "child");
  assertEquals(grand.toString(), "child/grand");
});

Deno.test("Construct.isConstruct returns true for constructs", () => {
  // GIVEN
  const root = new Root();
  class Subclass extends Construct {}
  const subclass = new Subclass(root, "subclass");
  const someRandomObject = {};

  // THEN
  assert(Construct.isConstruct(root));
  assert(Construct.isConstruct(subclass));
  assert(!Construct.isConstruct(undefined));
  assert(!Construct.isConstruct(null));
  assert(!Construct.isConstruct("string"));
  assert(!Construct.isConstruct(1234));
  assert(!Construct.isConstruct(true));
  assert(!Construct.isConstruct([1, 2, 3]));
  assert(!Construct.isConstruct(someRandomObject));
});

{
  const methods = [
    "validate",
    "onValidate",
    "synthesize",
    "onSynthesize",
    "prepare",
    "onPrepare",
  ];

  for (const method of methods) {
    Deno.test(method, () => {
      const c = new Construct(new Root(), "MyConstruct");
      Object.defineProperty(c, method, {
        value: () => [],
      });

      assertThrows(() => c.node.validate(), Error, "no longer supported");
    });
  }
}

function createTree(context?: any) {
  const root = new Root();
  const highChild = new Construct(root, "HighChild");
  if (context) {
    Object.keys(context).forEach((key) =>
      highChild.node.setContext(key, context[key])
    );
  }

  const child1 = new Construct(highChild, "Child1");
  const child2 = new Construct(highChild, "Child2");
  const child1_1 = new Construct(child1, "Child11");
  const child1_2 = new Construct(child1, "Child12");
  const child1_1_1 = new Construct(child1_1, "Child111");
  const child2_1 = new Construct(child2, "Child21");

  return {
    root,
    child1,
    child2,
    child1_1,
    child1_2,
    child1_1_1,
    child2_1,
  };
}

class MyBeautifulConstruct extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);
  }
}

interface ValidationError {
  readonly source: IConstruct;
  readonly message: string;
}
