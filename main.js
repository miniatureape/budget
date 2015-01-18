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
        current_module: null,
        current_budget: null,
    },

});

var Budget = Backbone.Model.extend({

    defaults: { 
        name: null,
        allowance: null,
        cummulative_total: 0,
    },

    incrementTotal: function(amount) {
        this.set('cummulative_total', this.get('cummulative_total') + amount);
    },

    storeExpense: function(amount) {

        ExpensesList.create({
            amount: amount,
            date: (new Date).getTime(),
            budget: this.id
        }, {silent: true}).save();

        this.incrementTotal(-amount);
        this.save();

    }
});

var Budgets = Backbone.Collection.extend({

    model: Budget,

    localStorage: new Backbone.LocalStorage("Budgets"),

    grandTotal: function() {
        return this.reduce(function(memo, budget) {
            return memo + budget.get('cummulative_total');
        }, 0);
    },

    renew: function() {
        this.each(function(budget) {
            budget.incrementTotal(budget.get('allowance'));
            budget.save();
        });
    }
});

var Expense = Backbone.Model.extend({

    defaults: { 
        amount : 0,
        date   : null, // Three letter DOW
        budget : null, // Association to a Budget model.
    },

    serializeData: function() {
        var json = this.toJSON();
        json.fmt_date = moment(this.get('date')).format('ddd');
        return json;
    }

});

var Expenses = Backbone.Collection.extend({

    localStorage: new Backbone.LocalStorage("Expenses"),

    model: Expense,

    destroyAll: function() {
        var model;

        while (model = this.first()) {
            model.destroy();
        }
    }

});

/* Backbone Views */

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

/* Marionette Views Start */

var AppLayout = M.LayoutView.extend({

    template: '#app-layout',

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
        var currentBudget = App.get('current_budget'); 
        return new BudgetLayout({model: BudgetList.get(currentBudget)});
    }

});

var SelectionLayout = M.LayoutView.extend({

    template: '#selection-layout',

    regions: {
        'budgetList' : '[data-budget-list-mount]',
        'actions'    : '[data-actions]',
        'grandTotal' : '[data-grand-total]',
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
        this.getRegion('grandTotal').show(new GrandTotalView({
            model: BudgetList
        }));
        this.getRegion('actions').show(new SelectionModuleActionsView());
    },

    createNewBudget: function() {

        // TODO prompt -> Modal
        // but allowance into a helper method

        var budgetName   = prompt("Name your budget", "Spending Money");
        var allowance = parseInt(prompt("How much money?", 100), 10);

        if (!budgetName) {
            return;
        }

        var budget = BudgetList.create({
            name: budgetName,
            allowance: allowance
        });
        budget.save();

        App.set({
            'current_module': MODULES.budget,
            'current_budget': budget.id
        });
        App.save();
    },

});

var SelectionModuleActionsView = M.ItemView.extend({

    events: {
        'click [data-reset-all]': 'resetAllBudgets'
    },

    template: '#selection-module-actions',

    resetAllBudgets: function() {

        // TODO confirm -> Modal
        if (!confirm("Restart week for all budgets?")) {
            return;
        }

        ExpensesList.destroyAll();
        BudgetList.renew();

        // TODO you should be able to remove this.
        window.location.reload();
    }
});

var EmptySelectionView = M.ItemView.extend({
    template: '#empty-selection'
});

var BudgetItemView = M.ItemView.extend({

    template: '#budget-row',

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

    template: '#budget-layout',

    regions: {
        expenseList: '[data-expense-list]',
        balance: '[data-balance]',
        actions: '[data-budget-actions]',
    },

    onShow: function() {
        this.getRegion('expenseList').show(new ExpenseListView({
            collection: ExpensesList,
            model: this.model
        }));
        // TODO implement BalanceView
        // this.getRegion('balance').show(new BalanceView());
        this.getRegion('actions').show(new BudgetActionsView());
    },

});

var ExpenseRowView = M.ItemView.extend({

    template: '#expense-row',

    serializeData: function() {
        return this.model.serializeData();
    },

    onRender: function() {
        // Hack around the tag name issue without having 
        // to move markup into this class. :(
        this.$el = this.$el.children();
        this.$el.unwrap();
        this.setElement(this.$el);
    }
});

var NoExpensesView = M.ItemView.extend({
    template: '#no-expenses',
});

var ExpenseListView = M.CompositeView.extend({

    template: '#expenses-table',

    childView: ExpenseRowView,

    emptyView: NoExpensesView,

    childViewContainer: '[data-expense-list]',

    events: {
        keydown: 'handleSubmit'
    },

    ui: {
        input: '[data-expense-form]'
    },

    handleSubmit: function(e) {

        if (!this.validEvent(e)) {
            return;
        }

        var amount = Math.ceil(
            parseFloat(this.ui.input.val())
        );

        if (!_.isNumber(amount)) { 
            return;
        }

        if (this.maybeWipe(amount)) {
            return;
        }

        this.model.storeExpense(amount);
    },

    resetInput: function() {
        this.$el.val('');
    },

    validEvent: function(e) {
        return [KEYS.tab, KEYS.enter].indexOf(e.keyCode) !== -1;
    }, 

    // TODO Delete this when the UI to perform restarts is complete
    maybeWipe: function(amount) {

        var wiped = false;

        if (amount === 2015) {
            wiped = true;
            this.model.destroy();
            App.set('current_budget', null);
            App.save();
            return;
        }

        if (amount === 666) {
            wiped = true;
            window.localStorage.clear();
            window.location.reload();
            return;
        }

        return wiped;

    },

    /* This is a bit of a hack. Because we don't have the proper 
     * hooks into the list view rendering, we need to precompute
     * the running_total before hand. But we don't want that attribute
     * to hang around and need to be maintained, so afterwords we unset it
     */

    onBeforeRenderCollection: function() {
        var startAmount = this.model.get('allowance');
        this.collection.each(function(expense) {
            expense.set('running_total', startAmount -= expense.get('amount'), {silent: true});
        })
    },

    onRenderCollection: function() {
        this.collection.each(function(expense) {
            expense.unset('running_total', {silent: true});
        });
    },

});

var BalanceView = M.ItemView.extend({
});

var BudgetActionsView = M.ItemView.extend({
    template: '#budget-actions',
});

var GrandTotalView = M.ItemView.extend({

    template: _.template($('#total-row').html()),

    serializeData: function() {
        return {
            grand_total: this.model.grandTotal()
        };
    },

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
