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
    // request JSON from API
    const response = await fetch('https://api.opencovid.ca/datasets')
    const json = await response.json()
    // return JSON data
    return json
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
            dirs[k][k2] = Object.keys(dirs[k][k2]).sort().reduce(function(obj, item) {
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
    // get update time
    const response = await fetch('https://api.opencovid.ca/version?route=archive&date_only=false')
    const json = await response.json()
    // set update time
    document.getElementById('update-time').innerHTML = 'Archive index was last updated: ' + json['archive']
};

// function: get UUID
async function getUUID(uuid) {
    const api_url = 'https://api.opencovid.ca/archive?uuid=' + uuid
    // request JSON from API
    const response = await fetch(api_url)
    const json = await response.json()
    // return JSON data
    return json
};

// function: build files table
async function buildTableFiles(uuid) {

    // get JSON for UUID
    const json_uuid = await getUUID(uuid)

    // show table container
    document.getElementById('table-container').classList.remove('hidden');

    // check if UUID is valid
    if (typeof json_uuid['data'] == 'undefined') {
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
        Object.keys(json_uuid['data']).forEach(function (i) {
            // construct HTML link to file for table
            json_uuid['data'][i]['file_link'] = '<a href="' + json_uuid['data'][i]['file_url'] + '">' + json_uuid['data'][i]['file_name'] + '</a>'
            // convert bytes to MB
            json_uuid['data'][i]['file_size_mb'] = json_uuid['data'][i]['file_size'] / 1000000 + ' MB'
            // Duplicate or no
            json_uuid['data'][i]['file_duplicate'] = json_uuid['data'][i]['file_duplicate'] == 1 ? 'Yes' : 'No'
        });

        // initialize table or update table
        if (!DataTable.isDataTable('#table-files')) {
            // initialize table
            new DataTable('#table-files', {
            bAutoWidth : false,
            aaData : json_uuid['data'],
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
                    targets: 3
                }
            ],
            order: [[0, "desc"]]
            });
        } else {
            // update table
            let datatable = new DataTable('#table-files');
            datatable.clear().rows.add(json_uuid['data']).draw();
        };
    };

    // update API URL
    let api_url = 'https://api.opencovid.ca/archive?uuid=' + uuid
    document.getElementById('api-url').innerHTML = ('<a target="_blank" href="' + api_url + '">' + api_url + '</a>')

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
        } else {
            d['meta_group'] = d['metadata']['meta_group_1'] + ' / ' + d['metadata']['meta_group_2']
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
                "mData": "meta_group"
            },
            {
                "mData": "metadata.meta_url_name"
            },
            {
                "mData": "metadata.meta_name"
            },
            {
                "mData": "active"
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
                targets: 1
            },
            {
                title: "File group",
                width: "35%",
                targets: 2
            },
            {
                title: "File name",
                width: "30%",
                targets: 3,
            },
            {
                title: "Active?",
                width: "10%",
                targets: 4,
                className: "dt-center",
                searchable: false
            },
            {
                title: "File list",
                width: "10%",
                targets: 5,
                className: "dt-center",
                searchable: false
            },
            {
                title: "UUID",
                targets: 6,
                visible: false,
                searchable: true
            }
        ],
        order: [[1, "asc"], [2, "asc"], [3, "asc"]],
        pageLength: 10,
        // pre-fill search box
        search: {
            search: (uuid_selected != undefined ? uuid_selected : '')
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
                '<td>File group:</td>' +
                '<td><a href="' + d['metadata']['meta_url'] + '">' + d['metadata']['meta_url_name'] + '</a></td>' +
            '</tr>' +
            '<tr>' +
                '<td>File name:</td>' +
                '<td>' + d['metadata']['meta_name'] + '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>Active:</td>' +
                '<td>' + d['active'] + '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>URL:</td>' +
                '<td>' + d['url'] + '</td>' +
            '</tr>' +
            '<tr>' +
                '<td>UUID:</td>' +
                '<td><a href="https://api.opencovid.ca/archive?uuid=' + d['uuid'] + '">' + d['uuid'] + '</a></td>' +
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
    let dirs = await getDirs(json_datasets['data']);

    // add files to directories
    dirs = await getFiles(json_datasets['data'], dirs);

    // build tree
    let root = await buildTree(dirs, uuid_selected);
    
    // initialize tree
    tree_nodes['tree'] = new TreeView(root, '#tree');

    // set update time
    setUpdateTime();

    // build datasets table
    buildTableDatasets(json_datasets['data'], uuid_selected);
};

// build page
buildPage();