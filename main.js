// function: get value of parameter in query string
function getParamFromQueryString(param) {
    const params = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });
    // get value of chosen parameter
    let value = params[param]
    // return value
    return value
};

// function: get datasets
async function getDatasets() {
    // request JSON from GitHub
    const response = await fetch('https://raw.githubusercontent.com/ccodwg/Covid19CanadaArchive/master/datasets.json')
    const json = await response.json()
    // unpack datasets
    const out = [];
    Object.values(json).forEach(j => {
        Object.values(j).forEach(k => {
        out.push(...k);
        });
    });
    // return datasets list
    return out
};

// function: get directories
async function getDirs(json_datasets) {
    let parent_dirs = []
    // get parent directories ('meta_group_1')
    Object.keys(json_datasets).forEach(function(k) {
        parent_dirs.push(json_datasets[k]['metadata']['meta_group_1'])
    });
    // sort unique values
    parent_dirs = [...new Set(parent_dirs)].sort()
    // move 'other' directories to the end of the array
    let max_dirs = parent_dirs.length
    let parent_dirs_other = []
    for (let i = 0; i < max_dirs; i++) {
        d = parent_dirs[i]
        if (d.match('Other: ')) {
            parent_dirs_other.push(d)
        }
    };
    parent_dirs = parent_dirs.filter(function(d) {
        return !d.match('Other: ')
    });
    parent_dirs = parent_dirs.concat(parent_dirs_other)
    // convert array to object
    dirs = parent_dirs.reduce(function(obj, item) {
        obj[item] = {};
        return obj;
    }, {});
    // add second-level directories ('meta_group_2') to top-level directories
    Object.keys(json_datasets).forEach(function(k) {
        let dir = json_datasets[k]['metadata']['meta_group_1']
        let subdir = json_datasets[k]['metadata']['meta_group_2']
        if (subdir != undefined) {
            dirs[dir][subdir] = {}
        };
    });
    // sort second-level directories
    Object.keys(dirs).forEach(function(k) {
        dirs[k] = Object.keys(dirs[k]).sort().reduce(function(obj, item) {
            obj[item] = dirs[k][item];
            return obj;
        }, {});
    });
    // add second-level directory 'Parent' to top-level directories (in last place)
    Object.keys(dirs).forEach(function(k) {
        dirs[k]['Parent'] = {}
    });
    // add file groups ('meta_url_name') to second-level directories
    Object.keys(json_datasets).forEach(function(k) {
        let dir = json_datasets[k]['metadata']['meta_group_1']
        let subdir = json_datasets[k]['metadata']['meta_group_2']
        let file_group = json_datasets[k]['metadata']['meta_url_name']
        if (subdir == undefined) {
            dirs[dir]['Parent'][file_group] = {}
        } else {
            dirs[dir][subdir][file_group] = {}
        };
    });
    // sort file groups
    Object.keys(dirs).forEach(function(k) {
        Object.keys(dirs[k]).forEach(function(k2) {
            dirs[k][k2] = Object.keys(dirs[k][k2]).sort(function(a, b) {
                return a.toLowerCase().localeCompare(b.toLowerCase());
            }).reduce(function(obj, item) {
                obj[item] = dirs[k][k2][item];
                return obj;
            }, {});
        });
    });
    // return object
    return dirs
};

// function: add files to directories
async function getFiles(json_datasets, dirs) {
    // add files to directories
    Object.keys(json_datasets).forEach(function(k) {
        let dir = json_datasets[k]['metadata']['meta_group_1']
        let subdir = json_datasets[k]['metadata']['meta_group_2']
        let file_group = json_datasets[k]['metadata']['meta_url_name']
        let file = json_datasets[k]['metadata']['meta_name']
        if (subdir == undefined) {
            dirs[dir]['Parent'][file_group][file] = json_datasets[k]
        } else {
            dirs[dir][subdir][file_group][file] = json_datasets[k]
        };
    });
    // sort files
    Object.keys(dirs).forEach(function(k) {
        Object.keys(dirs[k]).forEach(function(k2) {
            Object.keys(dirs[k][k2], function(k3) {
                dirs[k][k2][k3] = Object.keys(dirs[k][k2][k3]).sort().reduce(function(obj, item) {
                    obj[item] = dirs[k][k2][k3][item];
                    return obj;
                }, {});
            });
        });
    });
    // return object
    return dirs
};

// function: build tree
async function buildTree(dirs, uuid_selected) {
    // create global container for tree nodes
    window.tree_nodes = {}
    let root = new TreeNode('Archive')
    // add nodes for first-level directories
    Object.keys(dirs).forEach(function(k) {
        let node = new TreeNode(k)
        root.addChild(node)
        // add nodes for second-level directories
        Object.keys(dirs[k]).forEach(function(k2) {
            if (k2 != 'Parent') {
                // second-level directory exists
                let node2 = new TreeNode(k2)
                node.addChild(node2)
                // add nodes for third-level directories
                Object.keys(dirs[k][k2]).forEach(function(k3) {
                    let node3 = new TreeNode(k3)
                    node2.addChild(node3)
                    // add nodes for files
                    Object.keys(dirs[k][k2][k3]).forEach(function(k4) {
                        let uuid = dirs[k][k2][k3][k4]['uuid']
                        tree_nodes[uuid] = new TreeNode(k4)
                        tree_nodes[uuid].on('select', function(){buildTableFiles(uuid);}) // add table build function on click
                        node3.addChild(tree_nodes[uuid])
                    });
                    node3.setExpanded(false) // collapsed by default
                });
                node2.setExpanded(false) // collapsed by default
            } else {
                // second-level directory does not exist (i.e., use parent directory)
                // add third-level directories
                Object.keys(dirs[k][k2]).forEach(function(k3) {
                    let node3 = new TreeNode(k3)
                    node.addChild(node3)
                    // add nodes for files
                    Object.keys(dirs[k][k2][k3]).forEach(function(k4) {
                        let uuid = dirs[k][k2][k3][k4]['uuid']
                        tree_nodes[uuid] = new TreeNode(k4)
                        tree_nodes[uuid].on('select', function(){buildTableFiles(uuid);}) // add table build function on click
                        node3.addChild(tree_nodes[uuid])
                    });
                    node3.setExpanded(false) // collapsed by default
                });
            };
        });
        node.setExpanded(false) // collapsed by default
    });
    // open selected UUID
    if (uuid_selected != undefined) {
        jumpToFiles(uuid_selected)
    };
    return root
};

// function: set update time
async function setUpdateTime() {
    // set update time (static)
    document.getElementById('update-time').innerHTML = 'Archive index was last updated: ' + '2024-01-31 22:45 EST'
};

// function: get UUID
async function getUUID(uuid) {
    const index_url = 'https://raw.githubusercontent.com/ccodwg/Covid19CanadaArchive-index/main/uuid/json/' + uuid + '.json'
    // request JSON from GitHub
    const response = await fetch(index_url)
    const json = await response.json()
    // return JSON data
    return json
};

// function: build files table
async function buildTableFiles(uuid) {

    // get JSON for UUID
    const json_uuid = await getUUID(uuid)

    // hide file selection message
    document.getElementById('files-select').classList.add('hidden');

    // show loading message
    document.getElementById('files-loading').classList.remove('hidden');

    // check if UUID is valid
    if (typeof json_uuid == 'undefined') {
        // show error message
        document.getElementById('files-error').classList.remove('hidden');
        // hide table
        document.getElementById('table-files-container').classList.add('hidden');
    } else {
        // hide error message
        document.getElementById('files-error').classList.add('hidden');
        // show table
        document.getElementById('table-files-container').classList.remove('hidden');
        // modify raw variables
        Object.keys(json_uuid).forEach(function (i) {
            uuid = json_uuid[i]['uuid']
            // construct HTML link to file for table
            json_uuid[i]['file_link'] = `<a href="${json_uuid[i]['file_url']}">${json_uuid[i]['file_name']}</a>`
            // convert bytes to MB
            json_uuid[i]['file_size_mb'] = json_uuid[i]['file_size'] / 1000000 + ' MB'
            // Duplicate or no
            json_uuid[i]['file_duplicate'] = json_uuid[i]['file_duplicate'] == 1 ? 'Yes' : 'No'
        });

        // initialize table or update table
        if (!DataTable.isDataTable('#table-files')) {
            // initialize table
            new DataTable('#table-files', {
                bAutoWidth : false,
                aaData : json_uuid,
                aoColumns : [
                    {
                        "data": "file_date"
                    },
                    {
                        "data": "file_link"
                    },
                    {
                        "data": "file_size_mb"
                    },
                    {
                        "data": "file_duplicate"
                    }
                ],
                columnDefs: [
                    {
                        title: "Date",
                        width: "20%",
                        targets: 0
                    },
                    {
                        title: "File name",
                        targets: 1
                    },
                    {
                        title: "File size (MB)",
                        width: "20%",
                        className: "dt-center",
                        targets: 2
                    },
                    {
                        title: "Duplicate file?",
                        width: "20%",
                        className: "dt-center",
                        targets: 3,
                        orderable: false
                    }
                ],
                order: [[0, "desc"]],
                // add column filter for duplicate files
                initComplete: function() {
                    this.api()
                        .columns(3)
                        .every(function() {
                            var column = this;
                            var header = $(column.header());
                            var selectContainer = $('<div></div>').appendTo(header);
                            var select = $('<select><option label="Show all" value=""></option></select>')
                                .appendTo(selectContainer)
                                .on('change', function () {
                                    var val = $.fn.dataTable.util.escapeRegex($(this).val());
                                    column.search(val ? '^' + val + '$' : '', true, false).draw();
                                });
                            column
                                .data()
                                .unique()
                                .sort()
                                .each(function(d) {
                                    select.append('<option value="' + d + '">' + d + '</option>');
                                });
                        });
                }
            });
        } else {
            // update table
            let datatable = new DataTable('#table-files');
            datatable.clear().rows.add(json_uuid).draw();
        };
    };

    // update index URL
    let index_url_json = 'https://raw.githubusercontent.com/ccodwg/Covid19CanadaArchive-index/main/uuid/json/' + uuid + '.json';
    let index_url_csv = 'https://raw.githubusercontent.com/ccodwg/Covid19CanadaArchive-index/main/uuid/csv/' + uuid + '.csv';
    document.getElementById('index-url-json').innerHTML = ('<a target="_blank" href="' + index_url_json + '">' + 'JSON' + '</a>');
    document.getElementById('index-url-csv').innerHTML = ('<a target="_blank" href="' + index_url_csv + '">' + 'CSV' + '</a>');
    document.getElementById('zip-url').innerHTML = ('<a target="_blank" href="https://archive.org/download/cc19da_' + uuid + '/cc19da_' + uuid + '.zip">ZIP download link</a>');
    document.getElementById('index-text').classList.remove('hidden');

    // hide loading message
    document.getElementById('files-loading').classList.add('hidden');

    // jump to top of page
    document.getElementById('table-container').scrollIntoView(alignToTop=true);
};

// function: build datasets table
async function buildTableDatasets(json_datasets, uuid_selected) {

    // extract data from JSON
    const datasets = Object.keys(json_datasets).map(key => json_datasets[key]);

    // create single group variable from meta_group_1 and meta_group_2
    datasets.forEach(function(d) {
        if (typeof(d['metadata']['meta_group_2']) == "undefined") {
            d['meta_group'] = d['metadata']['meta_group_1']
            d['meta_group_short'] = d['meta_group']
        } else {
            d['meta_group'] = d['metadata']['meta_group_1'] + ' / ' + d['metadata']['meta_group_2']
            d['meta_group_short'] = d['meta_group'].replace(": Non-governmental sources", "")
        }
    });
    
    // create HTML link for URL
    datasets.forEach(function(d) {
        if (typeof(d['url']) == 'undefined') {
            d['url'] = 'Dynamic URL retrieved from: <a href="' + d['metadata']['meta_url'] + '">' + d['metadata']['meta_url'] + '</a>'
        } else {
            d['url'] = '<a href="' + d['url'] + '">' + d['url'] + '</a>'
        }
    });

    // create link to list of files
    datasets.forEach(function(d) {
        d['file_list'] = '<span class="file-link">Jump to file list</span>'
    });

    // initialize table
    let table = new DataTable('#table-datasets', {
        bAutoWidth : false,
        aaData : datasets,
        aoColumns : [
            {
                className: 'dt-control',
                orderable: false,
                data: null,
                defaultContent: ''
            },
            {
                "mData": "meta_group_short"
            },
            {
                "mData": "metadata.meta_url_name"
            },
            {
                "mData": "metadata.meta_name"
            },
            {
                "mData": "file_list",
            },
            {
                "mData": "uuid"
            }
        ],
        columnDefs: [
            {
                title: "",
                width: "5%",
                targets: 0
            },
            {
                title: "Group",
                width: "10%",
                targets: 1,
                searchable: true,
                orderable: false
            },
            {
                title: "File group",
                width: "35%",
                targets: 2,
                searchable: true
            },
            {
                title: "File name",
                width: "40%",
                targets: 3,
                searchable: true
            },
            {
                title: "File list",
                width: "10%",
                targets: 4,
                className: "dt-center",
                searchable: false
            },
            {
                title: "UUID",
                targets: 5,
                visible: false,
                searchable: true
            }
        ],
        order: [[1, "asc"], [2, "asc"], [3, "asc"]],
        pageLength: 10,
        // pre-fill search box
        search: {
            search: (uuid_selected != undefined ? uuid_selected : '')
        },
        // add column filters for group
        initComplete: function() {
            this.api()
                .columns([1])
                .every(function(i) {
                    var column = this;
                    var header = $(column.header());
                    var selectContainer = $('<div></div>').appendTo(header);
                    var select = $('<select><option label="Show all" value=""></option></select>')
                        .appendTo(selectContainer)
                        .on('change', function () {
                            var val = $.fn.dataTable.util.escapeRegex($(this).val());
                            column.search(val ? '^' + val + '$' : '', true, false).draw();
                        });
                    var uniqueData = column
                        .data()
                        .unique()
                        .sort();
                    if (i === 1) {
                        uniqueData.sort(function(a, b) {
                            if (a.startsWith("Other /") && !b.startsWith("Other /")) return 1;
                            if (!a.startsWith("Other /") && b.startsWith("Other /")) return -1;
                            return a.localeCompare(b);
                        });
                    }
                    uniqueData.each(function(d) {
                        select.append('<option value="' + d + '">' + d + '</option>');
                    });
                });
        }
    });

    // construct row details
    function row_details(d) {
        let html =
        '<table cellpadding="5" cellspacing="0" border="0" style="padding-left:50px;">' +
            '<tr>' +
                '<td style="width:10%;">ID name:</td>' +
                '<td style="width:90%;">' + d['id_name'] + '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>Group:</td>' +
                '<td>' + d['meta_group'] + '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>File group:</td>' +
                '<td><a href="' + d['metadata']['meta_url'] + '">' + d['metadata']['meta_url_name'] + '</a></td>' +
            '</tr>' +
            '<tr>' +
                '<td>File name:</td>' +
                '<td>' + d['metadata']['meta_name'] + '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>URL:</td>' +
                '<td>' + d['url'] + '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>UUID:</td>' +
                '<td><a href="https://raw.githubusercontent.com/ccodwg/Covid19CanadaArchive-index/main/uuid/' + d['uuid'] + '.json' + '">' + d['uuid'] + '</a></td>' +
            '</tr>' +
            '<tr>' +
                '<td>File path:</td>' +
                '<td>' + d['dir_parent'] + '/' + d['dir_file'] + '/' + d['file_name'] + '.' + d['file_ext'] + '</td>' +
            '</tr>' +
            (typeof(d['notes']['notes_data']) == "undefined" ? '' :
            '<tr>' +
                '<td>Data notes:</td>' +
                '<td>' + d['notes']['notes_data'] + '</td>' +
            '</tr>') +
            (typeof(d['notes']['notes_usage']) == "undefined" ? '' :
            '<tr>' +
                '<td>Usage notes:</td>' +
                '<td>' + d['notes']['notes_usage'] + '</td>' +
            '</tr>') +
            (typeof(d['notes']['notes_misc']) == "undefined" ? '' :
            '<tr>' +
                '<td>Misc notes:</td>' +
                '<td>' + d['notes']['notes_misc'] + '</td>' +
            '</tr>') +
        '</table>'
        return html
    };

    // add on click event for opening/closing row details
    document.getElementById('table-datasets').addEventListener('click', function(e) {
        if (e.target.classList.contains('dt-control')) {
            let tr = e.target.closest('tr');
            let row = table.row(tr);
            if (row.child.isShown()) {
                row.child.hide();
                tr.classList.remove('shown');
            } else {
                row.child(row_details(row.data())).show();
                tr.classList.add('shown');
            };
        };
    });
    
    // add on click event for 'File list' column to jump to file list
    document.getElementById('table-datasets').addEventListener('click', function(e) {
        if (e.target.classList.contains('file-link')) {
            // unselect all existing nodes
            tree_nodes['tree'].getSelectedNodes().forEach(node => node.setSelected(false));
            // collapse all existing nodes
            tree_nodes['tree'].collapseAllNodes();
            // extract UUID from row data
            let tr = e.target.closest('tr');
            let row = table.row(tr);
            let data = row.data();
            let uuid = data['uuid'];
            // jump to file list
            jumpToFiles(uuid);
            // reload tree view
            tree_nodes['tree'].reload();
        };
    });
};

// function: jump to file list
function jumpToFiles(uuid) {
    // get tree path
    if (typeof tree_nodes[uuid] != 'undefined') {
        let selected = new TreePath(tree_nodes[uuid].getRoot(), tree_nodes[uuid]);
        // open nodes
        selected.getPath().forEach(function(k){
            k.setExpanded(true);
        });
        // select final node
        tree_nodes[uuid].setSelected(true);
    } else {
        // warning popup
        window.alert('Invalid UUID in query string: ' + uuid);
    };
};

// function: build page
async function buildPage() {

    // get JSON datasets
    const json_datasets = await getDatasets();

    // get UUID param from URL
    const uuid_selected = getParamFromQueryString('uuid');

    // get directories
    let dirs = await getDirs(json_datasets);

    // add files to directories
    dirs = await getFiles(json_datasets, dirs);

    // build tree
    let root = await buildTree(dirs, uuid_selected);
    
    // initialize tree
    tree_nodes['tree'] = new TreeView(root, '#tree');

    // set update time
    setUpdateTime();

    // build datasets table
    buildTableDatasets(json_datasets, uuid_selected);
};

// build page
buildPage();