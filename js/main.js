var yawiki = (function(self) {
  class IDbDAL {
    constructor() {
      this.init = () => Q.fcall(() => 0);
      this.listFiles = () => localforage.keys();
      this.loadFile = (k) => localforage.getItem(k);
      this.deleteFile = (k) => localforage.removeItem(k);
      this.saveFile = (k, content) => localforage.setItem(k, {id: k, data: content, modified: new Date().getTime()});
    }
  }

  const renderer = new marked.Renderer();
  const container = document.getElementById('container');
  const modal = new RModal(document.getElementById('modal'), {
  });
  const cmdLineModal = new RModal(document.getElementById('cmdLineModal'), {
  });
  const importModal = new RModal(document.getElementById('importModal'), {
  });
  const editor = ace.edit('editor');
  const dal = new IDbDAL();
  const editors = {};
  let data = [], fuse = null, curr = null, i = 0, filesystem = null, cs = null;

  function renderPost(k, content, pos) {
    const old = [];

    for (var e in editors) {
      old.push(e);
    }

    const mm = `<div id="${k}" class="panel panel-default">
      <div class="panel-heading">${new Date(parseInt(k))}
      <span class="pull-right"><a href="javascript:void(0);" onclick="yawiki.deletePost('${k}');">delete</a>
      <a href="javascript:void(0);" onclick="yawiki.editPost('${k}');">edit</a></span></div>
      <div class="panel-body">
      ${marked(content, {renderer: renderer})}
      </div></div>`;
    container.insertAdjacentHTML(pos || 'beforeend', mm);

    mermaid.init(undefined, '.graph');

    for (var x in editors) {
      if (old.indexOf(x) === -1) {
        let editor = ace.edit(x);
        editor.setReadOnly(true);
        editor.getSession().setMode('ace/mode/' + editors[x]);
      }
    }
  }

  function getPost(k) {
    data.some((post) => {
      if(post.id === k) {
        renderPost(k, post.data);
        return true;
      }
    });
  }

  function saveTextAsFile(filename, content) {
    const textFileAsBlob = new Blob([content], { type:'text/plain' });
    const downloadLink = document.createElement('a');
    downloadLink.download = 'yawiki.md';
    downloadLink.innerHTML = 'Download File';
    downloadLink.href = window.URL.createObjectURL(textFileAsBlob);
    downloadLink.click();
  }

  self.addPost = () => {
    curr = null;
    editor.setValue('');
    modal.open();
  };

  self.cmdLineTool = () => {
    cmdLineModal.open();
  };

  self.importTool = () => {
    importModal.open();
  };

  self.export = () => {
    const k = new Date().getTime().toString();
    dal.listFiles().then((keys) => {
      Q.all(keys.map((k) => dal.loadFile(k))).then((entries) => {
        const data = entries.map((entry) => entry.data);
        saveTextAsFile(k, data.join('----------\n\n'));
      });
    });
  };

  self.savePost = function () {
    const k = curr || new Date().getTime().toString();
    const content = editor.getValue();
    dal.saveFile(k, content).then(() => {
      self.reloadData();
      modal.close();
      self.export();
    });
  };

  self.editPost = function (k) {
    curr = k;
    data.some((post) => {
      if (post.id === k) {
        editor.setValue(post.data);
        modal.open();
      }
    });
  };

  self.loadMore = () => {
    data.slice(i, 10).forEach((post) => {
      i++;
      getPost(post.id);
    });
  };

  self.deletePost = (k) => {
    if(confirm('Delete?')) {
      dal.deleteFile(k).then(() => {
        self.reloadData();
      });
    }
  };

  function clearPosts() {
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
  }

  self.search = () => {
    if(cs) {
      clearTimeout(cs);
    }

    cs = setTimeout(() => {
      clearPosts();
      const q = document.getElementById('query');

      if (q.value) {
        let res = fuse.search(q.value);
        res.forEach((d) => {
          getPost(d.item.id);
        });

        document.title = '>> ' + q.value;
      } else {
        i = 0;
        self.loadMore();
        document.title = '>> ^^ <<';
      }
    }, 250);
  };

  self.reloadData = function () {
    clearPosts();
    data = [];
    i = 0;
    dal.listFiles().then((keys) => {
      Q.all(keys.map((k) => {
        return dal.loadFile(k);
      })).then((entries) => {
        entries.forEach((entry) => data.push(entry));
        data.sort((a, b) => (b.modified || 0) - (a.modified || 0));
        fuse = new Fuse(data, {keys: ['data'], include: ['score'], threshold: 0.3, tokenize: true});
        self.loadMore();
      });
    });
  }

  self.import = function(content) {
    let k = new Date().getTime();
    const lines = content.split('\n');
    let buff = [];

    for (var line of lines) {
      if (line.startsWith('-------')) {
        const post = buff.join('\n');

        if(post.trim()) {
          dal.saveFile(k.toString(), post);
        }

        buff = [];
        k += 1;
      } else {
        buff.push(line);
      }
    }
  };

  function init() {
    document.title = '>>^^<<';
    mermaid.initialize({startOnLoad: false});
    renderer.code = (code, language) => {
      const id = new Date().getTime().toString();

      if(language === 'graph') {
        return `<div class="graph">${code}</div>`;
      } else {
        let i = 1;

        while (id in editors) {
          id = (new Date().getTime() + i).toString();
          i++;
        }

        editors[id] = language;

        if(['xml', 'json', 'sql'].indexOf(language) !== -1) {
          code = vkbeautify[language](code);
        }

        code = code.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');

        return `<div id="${id}" class="code" style="height:200px; width: 500px;">${code}</div>`;
      }
    };

    editor.commands.addCommand({
      name: 'saveFile',
      bindKey: {
        win: 'Ctrl-S',
        sender: 'editor|cli'
      },
      exec: (env, args, request) => self.savePost()
    });

    editor.getSession().setMode('ace/mode/markdown');

    self.reloadData();
  }

  self.modal = modal;
  dal.init().then(init);

  return self;
})(yawiki || {});

const importApp = new Vue({
  el: '#importApp',
  data: {
    text: ''
  },
  methods: {
    doImport: function() {
      yawiki.import(this.text);
    }
  }
});

const cmdLineApp = new Vue({
  el: '#cmdLineApp',
  data: {
    history : [],
    cmdLine: null,
    args: [],
    argsDiff: [],
    diff: { args: {}, diff: {}},
    output: null,
    outputDiff: null
  },
  watch: {
    args: {
      handler: function (newVal) {
        this.output = newVal.reduce((acc, arg) => `${acc} ${arg.name} ${arg.value}`, '');
        this._diff(newVal, this.argsDiff);
      },
      deep: true
    },
    argsDiff: {
      handler: function (newVal) {
        this.outputDiff = newVal.reduce((acc, arg) => `${acc} ${arg.name} ${arg.value}`, '');
        this._diff(this.args, newVal);
      },
      deep: true
    }
  },
  methods: {
    _diff: function(args, argsDiff) {
      let m = (a, b) => {
        return a.reduce((acc, arg) => {
          let cls = '';
          const found = b.find((x) => x.name === arg.name);
          if(found) {
            if (arg.value !== found.value) {
              cls = 'alert-danger';
            }
          } else {
            cls = 'alert-info';
          }

          acc[arg.name] = {[cls]: true};
          return acc;
        }, {});
      };

      this.diff = { args: m(args, argsDiff), diff: m(argsDiff, args) };
    },
    _parse: function () {
      const re = /(\-\-?\S+)\s+([^"-]\S+|\".*\")?/g;
      let m = re.exec(this.cmdLine);
      const res = [];

      while (m) {
        res.push({name: m[1], value: m[2] || '' });
        m = re.exec(this.cmdLine);
      }

      res.sort((a, b) => a.name > b.name);
      return res;
    },
    parseCmd: function () { this.args = this._parse(); },
    parseDiff: function () { this.argsDiff = this._parse(); },
    addArg: function (args) { args.push({name: '', value: ''}); },
    delArg: function(args, el) {
      const idx = args.indexOf(el);
      args.splice(idx, 1);
    }
  }
});

