var $                 = require('jquery-browserify');
var _                 = require('underscore');
var moment            = require('moment');
var Backbone          = require('backbone');
Backbone.$            = $;
Backbone.Marionette   = require('backbone.marionette');
Backbone.LocalStorage = require('backbone.localstorage');

var M = Backbone.Marionette;

var KEYS = {
    tab: 9,
    enter: 13,
};

var MODULES = {
    budget: 'budget',
    selection: 'selection'
};

var AppModel = Backbone.Model.extend({
    localStorage: new Backbone.LocalStorage("AppModel"),
    defaults: { 
        current_budget: null,
    },
});

var Budget = Backbone.Model.extend({
    defaults: { 
        allowance: null,
        cummulative_total: 0,
    },
    incrementTotal: function(amount) {
        this.set('cummulative_total', this.get('cummulative_total') + amount);
    }
});

var Budgets = Backbone.Collection.extend({
    model: Budget,
    localStorage: new Backbone.LocalStorage("Budgets"),
});

var Expense = Backbone.Model.extend({

    defaults: { 
        amount: 0,
        date: null,
        budget: null
    },

    serializeData: function() {
        var json = this.toJSON();
        json.fmt_date = moment(this.get('date')).format('ddd');
        return json;
    }

});

var Expenses = Backbone.Collection.extend({
    localStorage: new Backbone.LocalStorage("Expenses"),
    model: Expense
});

var ExpensesView = Backbone.View.extend({
    template:  _.template($('#expense-row').html()),
    emptyTemplate:  _.template($('#expenses-empty').html()),
    initialize: function(opts) {
        this.expenses = opts.expenses;
        this.filtered_expenses = opts.filtered_expenses;
        this.budget = opts.budget;
        this.listenTo(this.expenses, 'add remove reset sync', this.render);
    },
    events: {
        'click [data-expense-action]': 'remove',
    },
    remove: function(e) {
        if (confirm("Remove this expense?")) {
            var expense = this.expenses.get(e.currentTarget.id);
            this.budget.incrementTotal(expense.get('amount'));
            this.budget.save();
            this.expenses.remove(expense);
        }
    },
    renderEmpty: function() {
        this.$el.html(this.emptyTemplate());
    },
    renderExpenses: function() {
        var parts = [];
        var html = _.reduce(this.expenses.where({'budget': this.budget.id}), function(memo, expense) {
            var data = _.extend({}, expense.serializeData(), {
                running_total: this.budget.get('allowance') - (expense.get('amount') + memo),
                id: expense.id
            });
            parts.push(this.template(data));

            return memo + expense.get('amount');
        }, 0, this);

        this.$el.html(parts.join(''));
    },
    render: function() {
        if (_.isEmpty(this.expenses.where({'budget': this.budget.id}))) {
            this.renderEmpty();
        } else {
            this.renderExpenses();
        }
    }
});

var ExpenseForm = Backbone.View.extend({

    initialize: function(opts) {
        this.collection = opts.collection;
        this.budget = opts.budget;
    },

    events: {
        keydown: 'handleSubmit'
    },

    handleSubmit: function(e) {
        var val = this.$el.val();
        if ([KEYS.tab, KEYS.enter].indexOf(e.keyCode) == -1) return;
        if (!val) return;


        var amount = Math.ceil(parseFloat(val));
        
        // Special cases until I get some UI in here
        if (amount === 2015) {
            this.budget.destroy();
            App.set('current_budget', null);
            App.save();
            return;
        }

        if (amount === 666) {
            window.localStorage.clear();
            window.location.reload();
            return;
        }

        var expense = this.collection.create({
            amount: amount,
            date: (new Date).getTime(),
            budget: this.budget.id
        }).save();

        this.budget.incrementTotal(-amount);
        this.budget.save();

        this.$el.val('');
    }
});

var AllowanceView = Backbone.View.extend({

    initialize: function(opts) {
        this.budget = opts.budget;
        this.listenTo(this.budget, 'sync', this.render);
    },

    render: function() {
        this.$el.html(this.budget.get('allowance'));
    }
});

var ResetView = Backbone.View.extend({

    initialize: function(opts) {
        this.expenses = opts.expenses;
    },

    events: { 'click': 'resetWeek' },

    resetWeek: function() {

        var allowance = prompt("How much can you spend this week?", this.model.get('allowance') || '');
        allowance = parseInt(allowance, 10);

        if (_.isNaN(allowance)) {
            allowance = 0;
        }

        var model;

        while (model = this.expenses.where({'budget': this.model.id}).pop()) {
            model.destroy();
        }

        this.model.set('allowance', allowance);
        this.model.incrementTotal(allowance);

        this.model.save();
    }
});

var TotalView = Backbone.View.extend({

    initialize: function(opts) {
        this.expenses = opts.expenses;
        this.listenTo(this.model, 'change sync', this.render);
    },

    render: function() {
        this.$el.html(this.model.get('cummulative_total'));
    }
})

var BudgetListView = Backbone.View.extend({

    template: _.template($('#budget-row').html()),
    totalTemplate: _.template($('#total-row').html()),

    events: {
        'click [data-select-budget]': 'selectBudget'
    },

    initialize: function(opts) {
        this.budgets = opts.budgets;
    },

    render: function() {
        var html = this.budgets.reduce(function(memo, budget) {
            var data = _.extend({id: budget.id}, budget.toJSON());
            return memo + this.template(data);
        }, '', this);

        if (this.budgets.length) {
            var grand_total = this.budgets.reduce(function(memo, budget) {
                return memo + budget.get('cummulative_total');
            }, 0);

            html += this.totalTemplate({grand_total: grand_total});
        }

        this.$el.html(html);
    }, 

    selectBudget: function(e) {
        var id  = e.currentTarget.id;
        App.set('current_budget', id);
        App.save();
    },

});

var BudgetView = Backbone.View.extend({

    template: _.template($('#budget').html()),

    events: {
        'click [data-show-selection]': 'showSelection'
    },

    initialize: function(opts) {
        this.expenses = opts.expenses;
    },

    showSelection: function() {
        App.set('current_budget', null);
        App.save();
    },

    render: function() {

        this.$el.html(this.template(this.model.toJSON()));

        var expensesView = new ExpensesView({
            el: this.$el.find('[data-expense-list]'),
            budget: this.model,
            expenses: this.expenses,
        });

        var totalView = new TotalView({ 
            el: this.$el.find('[data-running-total-mount]'),
            model: this.model,
        });

        var allowanceView = new AllowanceView({
            el: this.$el.find('[data-allowance-mount]'),
            budget: this.model,
        });

        var expenseForm = new ExpenseForm({
            el: this.$el.find('[data-expense-form]'),
            budget: this.model,
            collection: this.expenses,
        });

        var resetView = new ResetView({ 
            el: this.$el.find('[data-reset-mount]'),
            model: this.model,
            expenses: this.expenses,
        });

        expensesView.render();
        totalView.render();
        allowanceView.render();
        expenseForm.render();
        resetView.render();

        if (_.isNull(this.model.get('allowance'))) {
            resetView.resetWeek();
        }

        return this.$el.html();

    },
});

var AppLayout = M.LayoutView.extend({

    template: _.template($('#app-layout').html()),

    initialize: function() {
        this.listenTo(App, 'change:current_module', this.render);
    },

    regions: {
        moduleRegion: '[data-module-region]',
    },

    onRender: function() {
        var moduleView = this.getModuleView();
        this.getRegion('moduleRegion').show(moduleView);
    },

    getModuleView: function() {
        var currentModule = App.get('current_module');
        return currentModule === MODULES.budget ? this.getBudgetLayout() : this.getSelectionLayout();
    },

    getSelectionLayout: function() {
        return new SelectionLayout();
    },

    getBudgetLayout: function() {
        return new BudgetLayout();
    }

});

var SelectionLayout = M.LayoutView.extend({

    template: _.template($('#selection-layout').html()),

    regions: {
        'budgetList' : '[data-budget-list-mount]',
        'actions'    : '[data-actions]',
        'empty'      : '[data-empty]',
    },

    events: {
        'click [data-new-budget]': 'createNewBudget',
    },

    onShow: function() {
        BudgetList.isEmpty() ?  this.showEmpty() : this.showBudgetList();

    },

    showEmpty: function() {
        this.getRegion('empty').show(new EmptySelectionView());
    },

    showBudgetList: function() {
        this.getRegion('budgetList').show(new BudgetListView({
            collection: BudgetList
        }));
        this.getRegion('actions').show(new SelectionModuleActionsView());
    },

    createNewBudget: function() {

        var budgetName = prompt("Name your budget", "Personal");

        if (!budgetName) {
            return;
        }

        var budget = BudgetList.create({name: budgetName});
        budget.save();
        App.set('current_module', MODULES.budget);
        App.set('current_budget', budget.id);
        App.save();
    },

});

var SelectionModuleActionsView = M.ItemView.extend({

    events: {
        'click [data-reset-all]': 'resetAllBudgets'
    },

    template: _.template($('#selection-module-actions').html()),

    resetAllBudgets: function() {

        if (!confirm("Restart week for all budgets?")) {
            return;
        }

        // destroy all expenses
        var model;
        while (model = ExpensesList.first()) {
            model.destroy();
        }

        BudgetList.each(function(budget) {
            budget.incrementTotal(budget.get('allowance'));
            budget.save();
        });

        window.location.reload();
    }
});

var EmptySelectionView = M.ItemView.extend({
    template: _.template($('#empty-selection').html())
});

var BudgetItemView = M.ItemView.extend({

    template: _.template($('#budget-row').html()),

    events: {
        'click [data-select-budget]': 'selectBudget'
    },

    selectBudget: function(e) {
        App.set('current_module', MODULES.budget);
        App.set('current_budget', $(e.currentTarget).attr('id'));
    },

})

var BudgetListView = M.CollectionView.extend({
    childView: BudgetItemView
})

var BudgetLayout = M.LayoutView.extend({

    template: _.template($('#selection-layout').html()),

    onShow: function() {
        console.log('showing budget');
    }
});

function main() {

    window.App = new AppModel({id: 1});
    var expenses = new Expenses();
    var budgets = new Budgets();
    window.BudgetList = budgets;
    window.ExpensesList = expenses;

    App.fetch();
    expenses.fetch();
    budgets.fetch();

    window.appLayout = new AppLayout({
        el: '[data-app]'
    });

    appLayout.render();

}

main();
