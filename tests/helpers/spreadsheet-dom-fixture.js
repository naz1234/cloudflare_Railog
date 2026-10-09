// Small XML DOM fixture for exercising the workbook's browser-side helpers in Node.
export class XmlElement {
  constructor(name, attributes = {}, children = []) {
    this.localName = name;
    this.nodeType = 1;
    this.namespaceURI = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    this.attributeValues = { ...attributes };
    this.childNodes = [];
    children.forEach((child) => this.appendChild(child));
  }
  get children() { return this.childNodes.filter((node) => node.nodeType === 1); }
  get attributes() { return Object.entries(this.attributeValues).map(([name, value]) => ({ name, value })); }
  get firstChild() { return this.childNodes[0]; }
  get textContent() { return this.childNodes.map((node) => node.textContent).join(""); }
  set textContent(value) { this.childNodes = [{ nodeType: 3, textContent: String(value), cloneNode() { return { ...this }; } }]; }
  getAttribute(name) { return this.attributeValues[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributeValues, name); }
  setAttribute(name, value) { this.attributeValues[name] = String(value); }
  setAttributeNS(_namespace, name, value) { this.setAttribute(name, value); }
  removeAttribute(name) { delete this.attributeValues[name]; }
  removeAttributeNode(attribute) { this.removeAttribute(attribute.name); }
  appendChild(child) { child.parentNode = this; this.childNodes.push(child); return child; }
  removeChild(child) { this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; return child; }
  insertBefore(child, next) { child.parentNode = this; const index = this.childNodes.indexOf(next); this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child); }
  cloneNode(deep) { return new XmlElement(this.localName, this.attributeValues, deep ? this.childNodes.map((child) => child.cloneNode(true)) : []); }
  getElementsByTagNameNS(_namespace, name) { return this.children.flatMap((child) => [...(child.localName === name ? [child] : []), ...child.getElementsByTagNameNS("*", name)]); }
}

export function xmlDocument(root) {
  return {
    documentElement: root,
    getElementsByTagNameNS(namespace, name) { return [...(root.localName === name ? [root] : []), ...root.getElementsByTagNameNS(namespace, name)]; },
    createElementNS(_namespace, name) { return new XmlElement(name); },
    importNode(node, deep) { return node.cloneNode(deep); },
  };
}
